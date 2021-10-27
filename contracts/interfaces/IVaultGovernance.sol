// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./IProtocolGovernance.sol";

interface IVaultGovernance {
    /// @notice Internal references of the contract
    /// @param protocolGovernance Reference to Protocol Governance
    /// @param registry Reference to Vault Registry
    struct InternalParams {
        IProtocolGovernance protocolGovernance;
        IERC721 registry;
    }

    // -------------------  PUBLIC, VIEW  -------------------

    /// @notice Timestamp in unix time seconds after which staged Delayed Strategy Params could be committed
    /// @param nft Nft of the vault
    function delayedStrategyParamsTimestamp(uint256 nft) external view returns (uint256);

    /// @notice Timestamp in unix time seconds after which staged Delayed Protocol Params could be committed
    function delayedProtocolParamsTimestamp() external view returns (uint256);

    /// @notice Timestamp in unix time seconds after which staged Internal Params could be committed
    function internalParamsTimestamp() external view returns (uint256);

    /// @notice Internal Params of the contract
    function internalParams() external view returns (InternalParams memory);

    /// @notice Staged new Internal Params
    /// @dev The Internal Params could be committed after internalParamsTimestamp
    function stagedInternalParams() external view returns (InternalParams memory);

    // -------------------  PUBLIC, MUTATING  -------------------

    /// @notice Stage new Internal Params
    /// @param newParams New Internal Params
    function stageInternalParams(InternalParams memory newParams) external;

    /// @notice Commit staged Internal Params
    function commitInternalParams() external;

    event StagedInternalParams(address indexed origin, address indexed sender, InternalParams newParams, uint256 start);
    event CommitedInternalParams(address indexed origin, address indexed sender, InternalParams newParams);
}
