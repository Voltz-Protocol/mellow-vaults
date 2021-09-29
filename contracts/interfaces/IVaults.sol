// SPDX-License-Identifier: MIT
pragma solidity 0.8.8;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IVaults is IERC721 {
    function managedTokens(uint256 nft) external view returns (address[] memory);

    function isManagedToken(uint256 nft, address token) external view returns (bool);

    function vaultTVL(uint256 nft) external view returns (address[] memory tokens, uint256[] memory tokenAmounts);

    function topVaultNft() external returns (uint256);

    function createVault(
        address[] memory cellTokens,
        uint256[] memory limits,
        bytes memory params
    ) external returns (uint256);

    function push(
        uint256 nft,
        address[] calldata tokens,
        uint256[] calldata tokenAmounts
    ) external returns (uint256[] memory actualTokenAmounts);

    function transferAndPush(
        uint256 nft,
        address from,
        address[] calldata tokens,
        uint256[] calldata tokenAmounts
    ) external returns (uint256[] memory actualTokenAmounts);

    function pull(
        uint256 nft,
        address to,
        address[] calldata tokens,
        uint256[] calldata tokenAmounts
    ) external returns (uint256[] memory actualTokenAmounts);

    function reclaimTokens(address to, address[] calldata tokens) external;

    event CreateVault(address indexed to, uint256 indexed nft, uint256[] limits, bytes params);
    event LimitsUpdated(uint256 indexed nft, uint256[] newLimits);
    event Push(uint256 indexed nft, address[] tokens, uint256[] actualTokenAmounts);
    event Pull(uint256 indexed nft, address indexed to, address[] tokens, uint256[] actualTokenAmounts);
}
