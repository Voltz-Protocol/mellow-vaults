// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/vaults/IERC20Vault.sol";
import "../interfaces/vaults/IVoltzVault.sol";
import "../interfaces/external/voltz/IMarginEngine.sol";
import "../interfaces/external/voltz/IPeriphery.sol";
import "../interfaces/external/voltz/IVAMM.sol";
import "../libraries/ExceptionsLibrary.sol";
import "../libraries/CommonLibrary.sol";
import "../libraries/external/FullMath.sol";
import "../utils/DefaultAccessControl.sol";
import "@prb/math/contracts/PRBMathSD59x18.sol";
import "hardhat/console.sol";

contract LPOptimiserStrategy is DefaultAccessControl {
    using SafeERC20 for IERC20;

    // IMMUTABLES
    address[] public _tokens;
    IERC20Vault public immutable _erc20Vault;

    // INTERNAL STATE
    IVoltzVault internal _vault;
    uint256[] internal _pullExistentials;
    IMarginEngine internal _marginEngine;
    IPeriphery internal _periphery;
    IVAMM internal _vamm;

    // MUTABLE PARAMS
    uint256 internal _sigmaWad; // y (standard deviation parameter in wad 10^18)
    int256 internal _maxPossibleLowerBoundWad; // should be in fixed rate
    int24 internal _logProximity; // x (closeness parameter in wad 10^18) in log base 1.0001

    // GETTERS AND SETTERS
    function setSigmaWad(uint256 sigmaWad) public {
        _requireAtLeastOperator();
        _sigmaWad = sigmaWad;
    }

    function setMaxPossibleLowerBound(int256 maxPossibleLowerBoundWad) public {
        _requireAtLeastOperator();
        _maxPossibleLowerBoundWad = maxPossibleLowerBoundWad;
    }

    function setLogProx(int24 logProx) public {
        _requireAtLeastOperator();
        require(logProx <= 0, ExceptionsLibrary.INVALID_VALUE);

        _logProximity = logProx;
    }

    function getSigmaWad() public view returns (uint256) {
        return _sigmaWad;
    }

    function getMaxPossibleLowerBound() public view returns (int256) {
        return _maxPossibleLowerBoundWad;
    }

    function getLogProx() public view returns (int24) {
        return _logProximity;
    }

    // EVENTS
    event RebalancedTicks(int24 newTickLowerMul, int24 newTickUpperMul);

    event StrategyDeployment(IERC20Vault erc20vault_, IVoltzVault vault_, address admin_);

    /// @notice Constructor for a new contract
    /// @param erc20vault_ Reference to ERC20 Vault
    /// @param vault_ Reference to Voltz Vault
    constructor(
        IERC20Vault erc20vault_,
        IVoltzVault vault_,
        address admin_
    ) DefaultAccessControl(admin_) {
        _erc20Vault = erc20vault_;
        _vault = vault_;
        _marginEngine = IMarginEngine(vault_.marginEngine());
        _periphery = IPeriphery(vault_.periphery());
        _vamm = IVAMM(vault_.vamm());
        _tokens = vault_.vaultTokens();
        _pullExistentials = vault_.pullExistentials();

        emit StrategyDeployment(erc20vault_, vault_, admin_);
    }

    /// @notice Get the current tick and position ticks and decide whether to rebalance
    /// @return bool True if rebalanceTicks should be called, false otherwise
    function rebalanceCheck() public view returns (bool) {
        // 1. Get current position, lower, and upper ticks form VoltzVault.sol
        IVoltzVault.TickRange memory currentPosition = _vault.currentPosition();

        // 2. Get current tick
        int24 currentTick = _periphery.getCurrentTick(_marginEngine);

        // 3. Compare current fixed rate to lower and upper bounds
        if (
            currentPosition.tickLower - _logProximity <= currentTick &&
            currentTick <= currentPosition.tickUpper + _logProximity
        ) {
            // 4.1. If current fixed rate is within bounds, return false (don't rebalance)
            return false;
        } else {
            // 4.2. If current fixed rate is outside bounds, return true (do rebalance)
            return true;
        }
    }

    /// @notice Get the nearest tick multiple given a tick and tick spacing
    /// @param newTick The tick to be rounded to the closest multiple of tickSpacing
    /// @param tickSpacing The tick spacing of the vamm being used for this strategy
    /// @return int24 The nearest tick multiple for newTick
    function nearestTickMultiple(int24 newTick, int24 tickSpacing) public pure returns (int24) {
        return
            (newTick /
                tickSpacing +
                ((((newTick % tickSpacing) + tickSpacing) % tickSpacing) >= tickSpacing / 2 ? int24(1) : int24(0))) *
            tickSpacing;
    }

    /// @notice Set new optimimal tick range based on current tick
    /// @param currentFixedRateWad currentFixedRate which is passed in from a 7-day rolling avg. historical fixed rate.
    /// @return newTickLowerMul The new lower tick for the rebalanced position
    /// @return newTickUpperMul The new upper tick for the rebalanced position
    function rebalanceTicks(uint256 currentFixedRateWad) public returns (int24 newTickLowerMul, int24 newTickUpperMul) {
        _requireAtLeastOperator();

        // 0. Get tickspacing from vamm
        int24 tickSpacing = _vamm.tickSpacing();

        // 1. Get the new tick lower
        int256 deltaWad = int256(currentFixedRateWad) - int256(_sigmaWad);
        int256 newFixedLowerWad;
        if (deltaWad > 1e15) {
            // delta is greater than 1e15 (0.001) => choose delta
            if (deltaWad < _maxPossibleLowerBoundWad) {
                newFixedLowerWad = deltaWad;
            } else {
                newFixedLowerWad = _maxPossibleLowerBoundWad;
            }
        } else {
            // delta is less than or equal to 1e15 (0.001) => choose 1e15 (0.001)
            newFixedLowerWad = 1e15;
        }
        // 2. Get the new tick upper
        int256 newFixedUpperWad = newFixedLowerWad + 2 * int256(_sigmaWad);

        // 3. Convert new fixed lower rate back to tick
        int256 newTickLowerWad = -PRBMathSD59x18.div(
            PRBMathSD59x18.log2(int256(newFixedUpperWad)),
            PRBMathSD59x18.log2(1000100000000000000)
        );

        // 4. Convert new fixed upper rate back to tick
        int256 newTickUpperWad = -PRBMathSD59x18.div(
            PRBMathSD59x18.log2(int256(newFixedLowerWad)),
            PRBMathSD59x18.log2(1000100000000000000)
        );

        // 5. Scale ticks from wad
        int256 newTickLower = newTickLowerWad / 1e18;
        int256 newTickUpper = newTickUpperWad / 1e18;

        // 6. The underlying Voltz VAMM accepts only ticks multiple of tickSpacing
        // Hence, we get the nearest usable tick
        newTickLowerMul = nearestTickMultiple(int24(newTickLower), tickSpacing);
        newTickUpperMul = nearestTickMultiple(int24(newTickUpper), tickSpacing);

        // Call to VoltzVault contract to update the position lower and upper ticks
        _vault.rebalance(IVoltzVault.TickRange(newTickLowerMul, newTickUpperMul));

        emit RebalancedTicks(newTickLowerMul, newTickUpperMul);
        return (newTickLowerMul, newTickUpperMul);
    }
}
