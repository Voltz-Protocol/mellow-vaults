// SPDX-License-Identifier: BSL-1.1
pragma solidity =0.8.9;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "../interfaces/IProtocolGovernance.sol";
import "../interfaces/trader/ITrader.sol";
import "../interfaces/trader/IChiefTrader.sol";
import "../libraries/AddressPermissions.sol";
import "../libraries/ExceptionsLibrary.sol";

/// @notice Main contract that allows trading of ERC20 tokens on different Dexes
/// @dev This contract contains several subtraders that can be used for trading ERC20 tokens.
/// Examples of subtraders are UniswapV3, UniswapV2, SushiSwap, Curve, etc.
contract ChiefTrader is ERC165, IChiefTrader, ITrader {
    IProtocolGovernance public immutable protocolGovernance;
    address[] internal _traders;
    mapping(address => bool) public addedTraders;

    constructor(address _protocolGovernance) {
        protocolGovernance = IProtocolGovernance(_protocolGovernance);
    }

    /// @inheritdoc IChiefTrader
    function tradersCount() external view returns (uint256) {
        return _traders.length;
    }

    /// @inheritdoc IChiefTrader
    function getTrader(uint256 _index) external view returns (address) {
        return _traders[_index];
    }

    /// @inheritdoc IChiefTrader
    function traders() external view returns (address[] memory) {
        return _traders;
    }

    /// @inheritdoc IChiefTrader
    function addTrader(address traderAddress) external {
        _requireProtocolAdmin();
        require(!addedTraders[traderAddress], ExceptionsLibrary.DUPLICATE);
        require(ERC165(traderAddress).supportsInterface(type(ITrader).interfaceId));
        require(!ERC165(traderAddress).supportsInterface(type(IChiefTrader).interfaceId));
        _traders.push(traderAddress);
        addedTraders[traderAddress] = true;
        emit AddedTrader(_traders.length - 1, traderAddress);
    }

    /// @inheritdoc ITrader
    function swapExactInput(
        uint256 traderId,
        uint256 amount,
        address,
        PathItem[] calldata path,
        bytes calldata options
    ) external returns (uint256) {
        require(traderId < _traders.length, ExceptionsLibrary.NOT_FOUND);
        _requireAllowedTokens(path);
        address traderAddress = _traders[traderId];
        address recipient = msg.sender;
        return ITrader(traderAddress).swapExactInput(0, amount, recipient, path, options);
    }

    /// @inheritdoc ITrader
    function swapExactOutput(
        uint256 traderId,
        uint256 amount,
        address,
        PathItem[] calldata path,
        bytes calldata options
    ) external returns (uint256) {
        require(traderId < _traders.length, ExceptionsLibrary.NOT_FOUND);
        _requireAllowedTokens(path);
        address traderAddress = _traders[traderId];
        address recipient = msg.sender;
        return ITrader(traderAddress).swapExactOutput(0, amount, recipient, path, options);
    }

    function supportsInterface(bytes4 interfaceId) public pure override returns (bool) {
        return (interfaceId == this.supportsInterface.selector ||
            interfaceId == type(ITrader).interfaceId ||
            interfaceId == type(IChiefTrader).interfaceId);
    }

    function _requireAllowedTokens(PathItem[] memory path) internal view {
        IProtocolGovernance pg = protocolGovernance;
        for (uint256 i = 1; i < path.length; ++i) {
            require(
                pg.hasPermission(path[i].token0, AddressPermissions.ERC20_SWAP) &&
                    pg.hasPermission(path[i].token1, AddressPermissions.ERC20_SWAP),
                ExceptionsLibrary.FORBIDDEN
            );
        }
        if (path.length > 0) {
            require(
                pg.hasPermission(path[0].token0, AddressPermissions.ERC20_TRANSFER),
                ExceptionsLibrary.FORBIDDEN
            );
            require(
                pg.hasPermission(path[0].token1, AddressPermissions.ERC20_SWAP),
                ExceptionsLibrary.FORBIDDEN
            );
        }
    }

    function _requireProtocolAdmin() internal view {
        require(protocolGovernance.isAdmin(msg.sender), ExceptionsLibrary.FORBIDDEN);
    }

    event AddedTrader(uint256 indexed traderId, address traderAddress);
}
