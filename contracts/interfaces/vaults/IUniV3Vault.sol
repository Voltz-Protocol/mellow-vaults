// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "./IIntegrationVault.sol";
import "../external/univ3/INonfungiblePositionManager.sol";

interface IUniV3Vault is IERC721Receiver, IIntegrationVault {
    /// @notice Reference to INonfungiblePositionManager of UniswapV3 protocol.
    function positionManager() external view returns (INonfungiblePositionManager);

    /// @notice NFT of UniV3 position manager
    function uniV3Nft() external view returns (uint256);

    /// @notice Initialized a new contract.
    /// @dev Can only be initialized by vault governance
    /// @param nft_ NFT of the vault in the VaultRegistry
    /// @param vaultTokens_ ERC20 tokens that will be managed by this Vault
    /// @param fee_ Fee of the UniV3 pool
    function initialize(
        uint256 nft_,
        address[] memory vaultTokens_,
        uint24 fee_
    ) external;

    /// @notice Collect UniV3 fees to zero vault.
    function collectEarnings() external returns (uint256[] memory collectedEarnings);
}
