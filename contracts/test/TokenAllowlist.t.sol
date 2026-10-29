// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {TokenAllowlist} from "../src/TokenAllowlist.sol";
import {ITokenAllowlist} from "../src/interfaces/ITokenAllowlist.sol";
import {TokenProbe} from "./mocks/Mocks.sol";

/// @dev SuperGoodDollar-shaped Pure Super Token: no underlying, decimals revert.
contract PureDollar {
    function getUnderlyingToken() external pure returns (address) {
        return address(0);
    }

    function getUnderlyingDecimals() external pure {
        revert();
    }
}

contract TokenAllowlistTest is Test {
    function test_allowsPureTokenWhenUnderlyingDecimalsRevert() public {
        address admin = makeAddr("admin");
        TokenAllowlist allow = new TokenAllowlist(admin);
        PureDollar token = new PureDollar();
        vm.prank(admin);
        allow.setSuperToken(address(token), true, ITokenAllowlist.TokenKind.Pure);
        assertTrue(allow.isAllowed(address(token)));
        assertEq(uint8(allow.kindOf(address(token))), uint8(ITokenAllowlist.TokenKind.Pure));
        assertEq(allow.underlyingOf(address(token)), address(0));
        assertEq(allow.underlyingDecimalsOf(address(token)), 0);
    }

    function test_initializeCanRegisterPureExtra() public {
        address admin = makeAddr("admin");
        TokenAllowlist impl = new TokenAllowlist(admin);
        TokenProbe wrapper = new TokenProbe(makeAddr("usdm"), 18);
        TokenProbe nativeToken = new TokenProbe(address(0), 18);
        PureDollar extra = new PureDollar();
        TokenAllowlist allow = TokenAllowlist(
            address(
                new ERC1967Proxy(
                    address(impl),
                    abi.encodeWithSignature(
                        "initialize(address,address,uint8,address,uint8,address,uint8)",
                        admin,
                        address(wrapper),
                        uint8(ITokenAllowlist.TokenKind.Wrapper),
                        address(nativeToken),
                        uint8(ITokenAllowlist.TokenKind.Native),
                        address(extra),
                        uint8(ITokenAllowlist.TokenKind.Pure)
                    )
                )
            )
        );
        assertTrue(allow.isAllowed(address(wrapper)));
        assertTrue(allow.isAllowed(address(nativeToken)));
        assertTrue(allow.isAllowed(address(extra)));
        assertEq(allow.owner(), admin);
    }
}
