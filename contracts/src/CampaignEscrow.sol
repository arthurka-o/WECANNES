// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

interface IWorldID {
    function verifyProof(
        uint256 root,
        uint256 groupId,
        uint256 signalHash,
        uint256 nullifierHash,
        uint256 externalNullifierHash,
        uint256[8] calldata proof
    ) external view;
}

contract CampaignEscrow {
    using SafeERC20 for IERC20;

    enum CampaignStatus {
        Open,
        Active,
        PendingReview,
        Completed,
        Expired
    }

    struct Campaign {
        address ngo;
        address sponsor;
        uint256 fundingRequired;
        uint256 minVolunteers;
        uint256 volunteerCount;
        uint256 sponsorshipDeadline;
        uint256 eventDeadline;
        uint256 reviewDeadline;
        CampaignStatus status;
    }

    IERC20 public immutable eurc;
    address public immutable city;
    IWorldID public immutable worldId;
    uint256 public immutable externalNullifierHash;

    mapping(uint256 => Campaign) public campaigns;

    // campaignId => nullifierHash => checked in
    mapping(uint256 => mapping(uint256 => bool)) public checkins;

    address[] public ngos;
    mapping(address => bool) public isNgo;

    uint256 public constant GROUP_ID = 1; // Orb verification
    uint256 public constant REVIEW_PERIOD = 7 days;

    // --- Events ---

    event CampaignCreated(uint256 indexed campaignId, address indexed ngo, uint256 fundingRequired);
    event CampaignFunded(uint256 indexed campaignId, address indexed sponsor);
    event VolunteerCheckedIn(uint256 indexed campaignId, uint256 nullifierHash);
    event CompletionSubmitted(uint256 indexed campaignId);
    event CompletionRejected(uint256 indexed campaignId);
    event FundsReleased(uint256 indexed campaignId, uint256 amount);
    event FundsRefunded(uint256 indexed campaignId, uint256 amount);

    // --- Errors ---

    error NotCity();
    error NotNgo();
    error NotSponsor();
    error NotNgoOfCampaign();
    error WrongStatus(CampaignStatus expected, CampaignStatus actual);
    error DeadlinePassed();
    error DeadlineNotPassed();
    error InvalidDeadlines();
    error InvalidFunding();
    error MinVolunteersNotMet(uint256 required, uint256 actual);
    error AlreadyCheckedIn();
    error CampaignAlreadyExists();

    modifier onlyCity() {
        if (msg.sender != city) revert NotCity();
        _;
    }

    modifier onlyNgo() {
        if (!isNgo[msg.sender]) revert NotNgo();
        _;
    }

    constructor(
        address _eurc,
        address _city,
        address[] memory _ngos,
        IWorldID _worldId,
        string memory _appId,
        string memory _action
    ) {
        eurc = IERC20(_eurc);
        city = _city;
        worldId = _worldId;
        externalNullifierHash = uint256(keccak256(abi.encodePacked(_appId, _action))) >> 8;
        for (uint256 i = 0; i < _ngos.length; i++) {
            isNgo[_ngos[i]] = true;
            ngos.push(_ngos[i]);
        }
    }

    // --- City ---

    function addNgo(address ngo) external onlyCity {
        if (!isNgo[ngo]) {
            isNgo[ngo] = true;
            ngos.push(ngo);
        }
    }

    // --- Volunteer check-in (World ID verified on-chain) ---

    function checkIn(
        uint256 campaignId,
        uint256 root,
        uint256 nullifierHash,
        uint256[8] calldata proof
    ) external {
        Campaign storage c = campaigns[campaignId];
        if (c.status != CampaignStatus.Active)
            revert WrongStatus(CampaignStatus.Active, c.status);
        if (checkins[campaignId][nullifierHash]) revert AlreadyCheckedIn();

        // Signal = string representation of campaignId (matches frontend)
        uint256 signalHash = uint256(keccak256(abi.encodePacked(Strings.toString(campaignId)))) >> 8;

        worldId.verifyProof(
            root,
            GROUP_ID,
            signalHash,
            nullifierHash,
            externalNullifierHash,
            proof
        );

        checkins[campaignId][nullifierHash] = true;
        c.volunteerCount++;

        emit VolunteerCheckedIn(campaignId, nullifierHash);
    }

    // --- NGO ---

    function createCampaign(
        uint256 campaignId,
        uint256 fundingRequired,
        uint256 minVolunteers,
        uint256 sponsorshipDeadline,
        uint256 eventDeadline
    ) external onlyNgo {
        if (campaigns[campaignId].ngo != address(0)) revert CampaignAlreadyExists();
        if (fundingRequired == 0) revert InvalidFunding();
        if (sponsorshipDeadline <= block.timestamp) revert InvalidDeadlines();
        if (eventDeadline <= sponsorshipDeadline) revert InvalidDeadlines();

        campaigns[campaignId] = Campaign({
            ngo: msg.sender,
            sponsor: address(0),
            fundingRequired: fundingRequired,
            minVolunteers: minVolunteers,
            volunteerCount: 0,
            sponsorshipDeadline: sponsorshipDeadline,
            eventDeadline: eventDeadline,
            reviewDeadline: 0,
            status: CampaignStatus.Open
        });

        emit CampaignCreated(campaignId, msg.sender, fundingRequired);
    }

    function submitCompletion(uint256 campaignId) external {
        Campaign storage c = campaigns[campaignId];
        if (c.ngo != msg.sender) revert NotNgoOfCampaign();
        if (c.status != CampaignStatus.Active)
            revert WrongStatus(CampaignStatus.Active, c.status);
        if (block.timestamp > c.eventDeadline) revert DeadlinePassed();
        if (c.volunteerCount < c.minVolunteers)
            revert MinVolunteersNotMet(c.minVolunteers, c.volunteerCount);

        c.status = CampaignStatus.PendingReview;
        c.reviewDeadline = block.timestamp + REVIEW_PERIOD;

        emit CompletionSubmitted(campaignId);
    }

    // --- Business ---

    function fundCampaign(uint256 campaignId) external {
        Campaign storage c = campaigns[campaignId];
        if (c.status != CampaignStatus.Open)
            revert WrongStatus(CampaignStatus.Open, c.status);
        if (block.timestamp > c.sponsorshipDeadline) revert DeadlinePassed();

        eurc.safeTransferFrom(msg.sender, address(this), c.fundingRequired);

        c.sponsor = msg.sender;
        c.status = CampaignStatus.Active;

        emit CampaignFunded(campaignId, msg.sender);
    }

    function approveRelease(uint256 campaignId) external {
        Campaign storage c = campaigns[campaignId];
        if (c.sponsor != msg.sender) revert NotSponsor();
        if (c.status != CampaignStatus.PendingReview)
            revert WrongStatus(CampaignStatus.PendingReview, c.status);

        _releaseFunds(campaignId);
    }

    function rejectCompletion(uint256 campaignId) external {
        Campaign storage c = campaigns[campaignId];
        if (c.sponsor != msg.sender) revert NotSponsor();
        if (c.status != CampaignStatus.PendingReview)
            revert WrongStatus(CampaignStatus.PendingReview, c.status);

        c.status = CampaignStatus.Active;

        emit CompletionRejected(campaignId);
    }

    function claimRefund(uint256 campaignId) external {
        Campaign storage c = campaigns[campaignId];
        if (c.sponsor != msg.sender) revert NotSponsor();
        if (c.status != CampaignStatus.Active)
            revert WrongStatus(CampaignStatus.Active, c.status);
        if (block.timestamp <= c.eventDeadline) revert DeadlineNotPassed();

        c.status = CampaignStatus.Expired;
        uint256 amount = c.fundingRequired;
        eurc.safeTransfer(c.sponsor, amount);

        emit FundsRefunded(campaignId, amount);
    }

    // --- Auto-release ---

    function autoRelease(uint256 campaignId) external {
        Campaign storage c = campaigns[campaignId];
        if (c.status != CampaignStatus.PendingReview)
            revert WrongStatus(CampaignStatus.PendingReview, c.status);
        if (block.timestamp <= c.reviewDeadline) revert DeadlineNotPassed();

        _releaseFunds(campaignId);
    }

    // --- Internal ---

    function _releaseFunds(uint256 campaignId) internal {
        Campaign storage c = campaigns[campaignId];
        c.status = CampaignStatus.Completed;
        uint256 amount = c.fundingRequired;
        eurc.safeTransfer(c.ngo, amount);

        emit FundsReleased(campaignId, amount);
    }

    // --- View ---

    function getCampaign(uint256 campaignId) external view returns (Campaign memory) {
        return campaigns[campaignId];
    }
}
