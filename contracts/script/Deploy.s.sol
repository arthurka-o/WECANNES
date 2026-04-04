// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Script, console} from "forge-std/Script.sol";
import {CampaignEscrow, IWorldID} from "../src/CampaignEscrow.sol";

contract Deploy is Script {
    function run() external {
        address deployer = vm.addr(vm.envUint("PRIVATE_KEY"));
        address eurc = 0x1C60ba0A0eD1019e8Eb035E6daF4155A5cE2380B;
        IWorldID worldIdRouter = IWorldID(0x17B354dD2595411ff79041f930e491A4Df39A278);
        string memory appId = "app_2ad38374173c3de8147350a2b73b37dc";
        string memory action = "checkin";

        address[] memory ngos = new address[](1);
        ngos[0] = deployer;

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        CampaignEscrow escrow = new CampaignEscrow(eurc, deployer, ngos, worldIdRouter, appId, action);
        vm.stopBroadcast();

        console.log("CampaignEscrow deployed at:", address(escrow));
        console.log("City:", deployer);
        console.log("NGO[0]:", deployer);
        console.log("EURC:", eurc);
        console.log("WorldIDRouter:", address(worldIdRouter));
    }
}
