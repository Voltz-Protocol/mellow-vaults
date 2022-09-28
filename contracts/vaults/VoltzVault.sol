// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.9;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../libraries/ExceptionsLibrary.sol";
import "./IntegrationVault.sol";
import "../interfaces/vaults/IVoltzVaultGovernance.sol";
import "../interfaces/vaults/IVoltzVault.sol";
import "../interfaces/external/voltz/utils/SqrtPriceMath.sol";
import "../interfaces/external/voltz/IPeriphery.sol";
import "../interfaces/external/voltz/utils/Time.sol";
import "../interfaces/external/voltz/utils/TickMath.sol";

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "hardhat/console.sol";

/// @notice Vault that interfaces Voltz protocol in the integration layer.
contract VoltzVault is IVoltzVault, IntegrationVault {
    using SafeERC20 for IERC20;
    using SafeCastUni for uint128;
    using SafeCastUni for int128;
    using SafeCastUni for uint256;
    using SafeCastUni for int256;
    using PRBMathSD59x18 for int256;
    using PRBMathUD60x18 for uint256;

    IPeriphery public _periphery;
    IMarginEngine public _marginEngine;
    IVAMM public _vamm;
    IRateOracle public _rateOracle;
    int24 _tickSpacing;
    uint256 _termStartTimestampWad;
    uint256 _termEndTimestampWad;

    uint256 _leverageWad;
    uint256 _marginMultiplierPostUnwindWad;
    uint256 _lookbackWindowInSeconds;
    uint256 _estimatedAPYUnitDeltaWad;

    /// tvl needs to be updated before use
    int256 _minTVL;
    int256 _maxTVL;
    uint256 _lastTvlUpdateTimestamp;
    int256 _aggregatedFixedTokenBalance;     // excludes current position
    int256 _aggregatedVariableTokenBalance;  // excludes current position
    int256 _aggregatedMargin;                // excludes current position

    /// information about LP positions of Vault
    TickRange[] trackedPositions;
    uint256 _currentPositionIndex;
    uint256 _currentPositionLiquidity;
    mapping (bytes => uint256) tickRangeToIndexPlusOne;
    uint256 settledPositionsCount;
    

    uint256 public constant SECONDS_IN_YEAR_IN_WAD = 31536000e18;
    uint256 public constant ONE_HUNDRED_IN_WAD = 100e18;


    // -------------------  PUBLIC, MUTATING  -------------------

    /// @notice Sets the leverage used for minting liquidity
    function setLeverage(uint256 leverageWad) public {
        // require(_isApprovedOrOwner(msg.sender), ExceptionsLibrary.FORBIDDEN);
        _leverageWad = leverageWad;
    }

    /// @notice Sets the multipler used to decide how 
    /// much margin must be left in an unwound position
    function setMarginMultiplierPostUnwind(uint256 marginMultiplierPostUnwindWad) public {
        // require(_isApprovedOrOwner(msg.sender), ExceptionsLibrary.FORBIDDEN);
        _marginMultiplierPostUnwindWad = marginMultiplierPostUnwindWad;
    }

    /// @notice Sets the lookback window used to estimate
    /// the APY between now and end of the pool: the APY
    /// between now and end is estimated to be the APY 
    /// in the past lookback window seconds
    function setLookbackWindow(uint256 lookbackWindowInSeconds) public {
        // require(_isApprovedOrOwner(msg.sender), ExceptionsLibrary.FORBIDDEN);
        _lookbackWindowInSeconds = lookbackWindowInSeconds;
    }

    /// @notice Sets the delta multiplier used to create lower
    /// and upper bounds on the estimated APY
    function setEstimatedAPYUnitDelta(uint256 estimatedAPYUnitDeltaWad) public {
        // require(_isApprovedOrOwner(msg.sender), ExceptionsLibrary.FORBIDDEN);
        _estimatedAPYUnitDeltaWad = estimatedAPYUnitDeltaWad;
    }

    // -------------------  EXTERNAL, VIEW  -------------------

    /// @inheritdoc IVoltzVault
    function leverage() external view override returns (uint256) {
        return _leverageWad;
    }

    /// @inheritdoc IVoltzVault
    function marginMultiplierPostUnwind() external view override returns (uint256) {
        return _marginMultiplierPostUnwindWad;
    }

    /// @inheritdoc IVoltzVault
    function lookbackWindow() external view override returns (uint256) {
        return _lookbackWindowInSeconds;
    }

    /// @inheritdoc IVoltzVault
    function estimatedAPYUnitDelta() external view override returns (uint256) {
        return _estimatedAPYUnitDeltaWad;
    }

    /// @inheritdoc IVault
    function tvl() public view returns (uint256[] memory minTokenAmounts, uint256[] memory maxTokenAmounts) {
        minTokenAmounts = new uint256[](1);
        maxTokenAmounts = new uint256[](1);

        if (_minTVL > 0) {
            minTokenAmounts[0] = _minTVL.toUint256();
        }

        if (_maxTVL > 0) {
            maxTokenAmounts[0] = _maxTVL.toUint256();
        }
    }

    /// @inheritdoc IVoltzVault
    function marginEngine() external view override returns (IMarginEngine) {
        return _marginEngine;
    }

    /// @inheritdoc IVoltzVault
    function vamm() external view override returns (IVAMM) {
        return _marginEngine.vamm();
    }

    /// @inheritdoc IVoltzVault
    function rateOracle() external view override returns (IRateOracle) {
        return _rateOracle;
    }

    /// @inheritdoc IVoltzVault
    function periphery() external view override returns (IPeriphery) {
        return IVoltzVaultGovernance(address(_vaultGovernance)).delayedProtocolParams().periphery;
    }

    function currentPosition() external view returns (TickRange memory) {
        return trackedPositions[_currentPositionIndex];
    }

    /// @inheritdoc IntegrationVault
    function supportsInterface(bytes4 interfaceId) public view override(IERC165, IntegrationVault) returns (bool) {
        return super.supportsInterface(interfaceId) || (interfaceId == type(IVoltzVault).interfaceId);
    }

    // -------------------  EXTERNAL, MUTATING  -------------------

    /// @inheritdoc IVoltzVault
    function rebalance(TickRange memory ticks) external override {
        // require(_isApprovedOrOwner(msg.sender), ExceptionsLibrary.FORBIDDEN);
        
        TickRange memory oldPosition = trackedPositions[_currentPositionIndex];

        require(oldPosition.tickLower != ticks.tickLower, ExceptionsLibrary.FORBIDDEN);
        require(oldPosition.tickUpper != ticks.tickUpper, ExceptionsLibrary.FORBIDDEN);

        // burn liquidity first, then unwind and exit existing position
        // this makes sure that we do not use our own liquidity to unwind ourselves
        _updateLiquidity(-_currentPositionLiquidity.toInt256());
        _unwindAndExitCurrentPosition();

        _updateCurrentPosition(ticks);
        uint256 vaultBalance = IERC20(_vaultTokens[0]).balanceOf(address(this));
        _updateMargin(vaultBalance.toInt256());
        uint256 liquidityToMint = vaultBalance.fromUint().mul(_leverageWad).toUint();
        _updateLiquidity(liquidityToMint.toInt256());

        emit PositionRebalance(
            oldPosition,
            trackedPositions[_currentPositionIndex]
        );
    }

    /// @inheritdoc IVoltzVault
    function initialize(
        uint256 nft_,
        address[] memory vaultTokens_,
        address marginEngine_,
        InitializeParams memory initializeParams
    ) external {
        require(vaultTokens_.length == 1, ExceptionsLibrary.INVALID_VALUE);

        _marginEngine = IMarginEngine(marginEngine_);
        
        address underlyingToken = address(_marginEngine.underlyingToken());
        require(vaultTokens_[0] == underlyingToken, ExceptionsLibrary.INVALID_VALUE);

        _initialize(vaultTokens_, nft_);

        _periphery = IVoltzVaultGovernance(address(_vaultGovernance)).delayedProtocolParams().periphery;
        _vamm = _marginEngine.vamm();
        _rateOracle = _marginEngine.rateOracle();
        _tickSpacing = _vamm.tickSpacing();
        _termStartTimestampWad = _marginEngine.termStartTimestampWad();
        _termEndTimestampWad = _marginEngine.termEndTimestampWad();

        setLeverage(initializeParams.leverageWad);
        setMarginMultiplierPostUnwind(initializeParams.marginMultiplierPostUnwindWad);
        setLookbackWindow(initializeParams.lookbackWindowInSeconds);
        setEstimatedAPYUnitDelta(initializeParams.estimatedAPYUnitDeltaWad);
        _updateCurrentPosition(
            TickRange(
                initializeParams.tickLower, 
                initializeParams.tickUpper
            )
        );

        emit VaultInitialized(
            marginEngine_,
            initializeParams.tickLower,
            initializeParams.tickUpper
        );
    }

    function updateTvl() external {
        uint256 timeInSecondsWad;

        uint256 termCurrentTimestampWad = Time.blockTimestampScaled();

        // Calculcate fixed factor
        uint256 fixedFactorValueWad = _fixedFactor(_termStartTimestampWad, _termEndTimestampWad);

        // Calculate estimated variable factor between start and end
        uint256 variableFactorStartCurrentWad = _rateOracle.variableFactorNoCache(
            _termStartTimestampWad, 
            termCurrentTimestampWad
        );
        uint256 lookbackWindowInSecondsWad = _lookbackWindowInSeconds.fromUint();
        uint256 historicalAPYWad = _rateOracle.getApyFromTo(
            (termCurrentTimestampWad - lookbackWindowInSecondsWad).toUint(), 
            termCurrentTimestampWad.toUint()
        );
        timeInSecondsWad = _termEndTimestampWad - termCurrentTimestampWad;
        uint256 estimatedVariableFactorCurrentEndWad = historicalAPYWad.mul(_accrualFact(timeInSecondsWad));
        uint256 estimatedVariableFactorStartEndLowerWad = 
            variableFactorStartCurrentWad + 
                estimatedVariableFactorCurrentEndWad.mul(
                    PRBMathUD60x18.fromUint(1) - _estimatedAPYUnitDeltaWad
                );
        uint256 estimatedVariableFactorStartEndUpperWad = 
            variableFactorStartCurrentWad + 
                estimatedVariableFactorCurrentEndWad.mul(
                    PRBMathUD60x18.fromUint(1) + _estimatedAPYUnitDeltaWad
                );

        // Aggregate estimated settlement cashflows into TVL
        Position.Info memory currentPositionInfo_ = _marginEngine.getPosition(
            address(this),
            trackedPositions[_currentPositionIndex].tickLower,
            trackedPositions[_currentPositionIndex].tickUpper
        );

        uint256 vaultBalance = IERC20(_vaultTokens[0]).balanceOf(address(this));
        _minTVL = vaultBalance.toInt256();
        _maxTVL = vaultBalance.toInt256();

        _minTVL += _estimateSettlementCashflow(
            _aggregatedFixedTokenBalance + currentPositionInfo_.fixedTokenBalance,
            fixedFactorValueWad,
            _aggregatedVariableTokenBalance + currentPositionInfo_.variableTokenBalance,
            estimatedVariableFactorStartEndLowerWad,
            _aggregatedMargin + currentPositionInfo_.margin
        );

        _maxTVL += _estimateSettlementCashflow(
            _aggregatedFixedTokenBalance + currentPositionInfo_.fixedTokenBalance,
            fixedFactorValueWad,
            _aggregatedVariableTokenBalance + currentPositionInfo_.variableTokenBalance,
            estimatedVariableFactorStartEndUpperWad,
            _aggregatedMargin + currentPositionInfo_.margin
        );

        _lastTvlUpdateTimestamp = block.timestamp;

        emit TvlUpdate(
            _minTVL,
            _maxTVL,
            _lastTvlUpdateTimestamp
        );
    }

    /// @notice Function that settles the position (if not settled already) 
    /// @notice and withdraws margin.
    function settleVaultPositionAndWithdrawMargin(TickRange memory position) public {
        Position.Info memory positionInfo = _marginEngine.getPosition(
            address(this),
            position.tickLower,
            position.tickUpper
        );

        if (!positionInfo.isSettled) {
            _marginEngine.settlePosition(
                address(this), 
                position.tickLower, 
                position.tickUpper
            );
        }

        positionInfo = _marginEngine.getPosition(
            address(this),
            position.tickLower,
            position.tickUpper
        );

        if (positionInfo.margin > 0) {
            _marginEngine.updatePositionMargin(
                address(this),
                position.tickLower, 
                position.tickUpper,
                -positionInfo.margin
            );
        }
    }

    /// @inheritdoc IVoltzVault
    function settleVault(uint256 batchSize) external override returns (uint256 settledBatchSize) {
        if (batchSize == 0) {
            batchSize = trackedPositions.length - settledPositionsCount;
        }

        uint256 from = settledPositionsCount;
        uint256 to = from + batchSize;
        if (trackedPositions.length < to) {
            to = trackedPositions.length;
        }

        for (uint256 i = from; i < to; i++) {
            _periphery.settlePositionAndWithdrawMargin(
                _marginEngine, 
                address(this), 
                trackedPositions[i].tickLower, 
                trackedPositions[i].tickUpper
            );
        }

        settledBatchSize = to - from;
        settledPositionsCount += settledBatchSize;
    }

    // -------------------  INTERNAL, VIEW  -------------------

    function _isStrategy(address addr) internal view returns (bool) {
        return _vaultGovernance.internalParams().registry.getApproved(_nft) == addr;
    }

    function _isReclaimForbidden(address) internal pure override returns (bool) {
        return false;
    }

    function _estimateSettlementCashflow(
        int256 aggregatedFixedTokenBalance,
        uint256 fixedFactorValueWad,
        int256 aggregatedVariableTokenBalance,
        uint256 estimatedVariableFactorStartEndWad,
        int256 aggregatedMargin
    ) internal returns (int256) {
        // Fixed Cashflow
        int256 fixedTokenBalanceWad = aggregatedFixedTokenBalance.fromInt();
        int256 fixedCashflowBalanceWad = fixedTokenBalanceWad.mul(int256(fixedFactorValueWad));
        int256 fixedCashflowBalance = fixedCashflowBalanceWad.toInt();
 
        // Variable Cashflow
        int256 variableTokenBalanceWad = aggregatedVariableTokenBalance.fromInt();
        int256 variableCashflowBalanceWad = variableTokenBalanceWad.mul(int256(estimatedVariableFactorStartEndWad));
        int256 variableCashflowBalance = variableCashflowBalanceWad.toInt();

        return fixedCashflowBalance + variableCashflowBalance + aggregatedMargin;
    }

    /// @notice Divide a given time in seconds by the number of seconds in a year
    /// @param timeInSecondsAsWad A time in seconds in Wad (i.e. scaled up by 10^18)
    /// @return timeInYearsWad An annualised factor of timeInSeconds, also in Wad
    function _accrualFact(uint256 timeInSecondsAsWad)
        internal
        pure
        returns (uint256 timeInYearsWad)
    {
        timeInYearsWad = timeInSecondsAsWad.div(SECONDS_IN_YEAR_IN_WAD);
    }

    function _fixedFactor(uint256 termStartTimestampWad, uint256 termEndTimestampWad)
        internal
        pure
        returns (uint256 fixedFactorWad)
    {
        require (termStartTimestampWad <= termEndTimestampWad, ExceptionsLibrary.TIMESTAMP);
        uint256 timeInSecondsWad = termEndTimestampWad - termStartTimestampWad;
        fixedFactorWad = _accrualFact(timeInSecondsWad).div(ONE_HUNDRED_IN_WAD);
    }

    // -------------------  INTERNAL, MUTATING  -------------------

    function _push(uint256[] memory tokenAmounts, bytes memory )
        internal
        override
        returns (uint256[] memory actualTokenAmounts)
    {
        actualTokenAmounts = new uint256[](1);
        actualTokenAmounts[0] = tokenAmounts[0];
        _updateMargin(tokenAmounts[0].toInt256());

        uint256 liquidityToMint = tokenAmounts[0].fromUint().mul(_leverageWad).toUint();
        _updateLiquidity(liquidityToMint.toInt256());

        emit PushDeposit(
            tokenAmounts[0],
            liquidityToMint
        );
    }

    function _pull(
        address to,
        uint256[] memory tokenAmounts,
        bytes memory 
    ) internal override returns (uint256[] memory actualTokenAmounts) {
        actualTokenAmounts = new uint256[](1);

        uint256 vaultBalance = IERC20(_vaultTokens[0]).balanceOf(address(this));

        uint256 amountToWithdraw = tokenAmounts[0];
        if (vaultBalance < amountToWithdraw) {
            amountToWithdraw = vaultBalance;
        }

        if (amountToWithdraw == 0) {
            return actualTokenAmounts;
        }

        IERC20(_vaultTokens[0]).safeTransfer(to, amountToWithdraw);
        actualTokenAmounts[0] = amountToWithdraw;

        emit PullWithdraw(
            tokenAmounts[0],
            actualTokenAmounts[0]
        );
    }

    function _updateMargin(int256 marginDelta) internal {
        if (marginDelta == 0) {
            return;
        }

        if (marginDelta > 0) {
            IERC20(_vaultTokens[0]).safeIncreaseAllowance(address(_periphery), marginDelta.toUint256());
        }

        _periphery.updatePositionMargin(
            _marginEngine,
            trackedPositions[_currentPositionIndex].tickLower,
            trackedPositions[_currentPositionIndex].tickUpper,
            marginDelta,
            false
        );

        if (marginDelta > 0) {
            IERC20(_vaultTokens[0]).safeApprove(address(_periphery), 0);
        }
    }

    function _updateLiquidity(int256 liquidityDelta) internal {
        if (liquidityDelta != 0) {
            IPeriphery.MintOrBurnParams memory params;
            // burn liquidity
            if (liquidityDelta < 0) {
                params = IPeriphery.MintOrBurnParams({
                    marginEngine: _marginEngine, 
                    tickLower: trackedPositions[_currentPositionIndex].tickLower,
                    tickUpper: trackedPositions[_currentPositionIndex].tickUpper,
                    notional: (-liquidityDelta).toUint256(),
                    isMint: false,
                    marginDelta: 0
                }); 
            }
            // mint liquidity
            else {
                params = IPeriphery.MintOrBurnParams({
                    marginEngine: _marginEngine, 
                    tickLower: trackedPositions[_currentPositionIndex].tickLower,
                    tickUpper: trackedPositions[_currentPositionIndex].tickUpper,
                    notional: liquidityDelta.toUint256(),
                    isMint: true,
                    marginDelta: 0
                });
            }

            _periphery.mintOrBurn(params);
            _currentPositionLiquidity = (_currentPositionLiquidity.toInt256() + liquidityDelta).toUint256();
        }
    }

    function _updateCurrentPosition(TickRange memory ticks) internal {
        require (Time.blockTimestampScaled() <= _termEndTimestampWad, ExceptionsLibrary.FORBIDDEN);

        Tick.checkTicks(ticks.tickLower, ticks.tickUpper);
        require(ticks.tickLower % _tickSpacing == 0, ExceptionsLibrary.INVALID_VALUE);
        require(ticks.tickUpper % _tickSpacing == 0, ExceptionsLibrary.INVALID_VALUE);

        bytes memory encodedTicks = abi.encode(ticks);
        if (tickRangeToIndexPlusOne[encodedTicks] == 0) {
            trackedPositions.push(ticks);
            _currentPositionIndex = trackedPositions.length - 1;
            tickRangeToIndexPlusOne[encodedTicks] = trackedPositions.length;
        } else {
            // we rebalance to some previous position
            // so we need to update the aggregate variables
            _currentPositionIndex = tickRangeToIndexPlusOne[encodedTicks] - 1;
            Position.Info memory currentPositionInfo_ = _marginEngine.getPosition(
                address(this),
                trackedPositions[_currentPositionIndex].tickLower,
                trackedPositions[_currentPositionIndex].tickUpper
            );
            _aggregatedFixedTokenBalance -= currentPositionInfo_.fixedTokenBalance;
            _aggregatedVariableTokenBalance -= currentPositionInfo_.variableTokenBalance;
            _aggregatedMargin -= currentPositionInfo_.margin;
        }

        _currentPositionLiquidity = 0;
    }
    
    function _unwindAndExitCurrentPosition() internal {
        Position.Info memory currentPositionInfo_ = _marginEngine.getPosition(
            address(this),
            trackedPositions[_currentPositionIndex].tickLower,
            trackedPositions[_currentPositionIndex].tickUpper
        );

        if (currentPositionInfo_.variableTokenBalance != 0) {
            bool _isFT = currentPositionInfo_.variableTokenBalance < 0;

            IVAMM.SwapParams memory _params = IVAMM.SwapParams({
                recipient: address(this),
                amountSpecified: currentPositionInfo_.variableTokenBalance,
                sqrtPriceLimitX96: _isFT
                    ? TickMath.MIN_SQRT_RATIO + 1
                    : TickMath.MAX_SQRT_RATIO - 1,
                tickLower: trackedPositions[_currentPositionIndex].tickLower,
                tickUpper: trackedPositions[_currentPositionIndex].tickUpper
            });

            (
                int256 _fixedTokenDelta,
                int256 _variableTokenDelta,
                uint256 _cumulativeFeeIncurred,
                ,

            ) = _vamm.swap(_params);

            currentPositionInfo_.fixedTokenBalance += _fixedTokenDelta;
            currentPositionInfo_.variableTokenBalance += _variableTokenDelta;
            currentPositionInfo_.margin -= _cumulativeFeeIncurred.toInt256();
        } 

        uint256 positionMarginRequirementInitial;

        bool trackPosition = false;
        uint256 marginToKeep = 0;
        if (currentPositionInfo_.variableTokenBalance != 0) {
            // keep k * initial margin requirement, withdraw the rest
            // need to track to redeem the rest at maturity
            positionMarginRequirementInitial = _marginEngine.getPositionMarginRequirement(
                address(this),
                trackedPositions[_currentPositionIndex].tickLower,
                trackedPositions[_currentPositionIndex].tickUpper,
                false
            );
            marginToKeep = 
                (_marginMultiplierPostUnwindWad.mul(
                    positionMarginRequirementInitial.fromUint()
                ).toUint());
            trackPosition = true;
        } else {
            if (currentPositionInfo_.fixedTokenBalance > 0) {
                // withdraw all margin
                // need to track to redeem ft cashflow at maturity
                positionMarginRequirementInitial = 0;
                marginToKeep = 0;
                trackPosition = true;
            } else {
                // withdraw everything up to amount that covers negative ft
                // no need to track for later settlement
                // since vt = 0, margin requirement initial is equal to fixed cashflow
                uint256 fixedFactorValueWad = _fixedFactor(_termStartTimestampWad, _termEndTimestampWad);
                positionMarginRequirementInitial = 
                    (-currentPositionInfo_.fixedTokenBalance).toUint256().fromUint().mul(
                        fixedFactorValueWad
                    ).toUint();
                marginToKeep = positionMarginRequirementInitial + 1;
            }
        }

        if (marginToKeep <= positionMarginRequirementInitial) {
            marginToKeep = positionMarginRequirementInitial + 1;
        }
        
        if (currentPositionInfo_.margin > 0) {
            if (marginToKeep > currentPositionInfo_.margin.toUint256()) {
                marginToKeep = currentPositionInfo_.margin.toUint256();
            }

            _updateMargin(-(currentPositionInfo_.margin - marginToKeep.toInt256()));
            currentPositionInfo_.margin = marginToKeep.toInt256();
        }
        
        if (!trackPosition) {
            // no need to track it, so we remove it from the array
            _removePositionFromTrackedPositions(_currentPositionIndex);
        } else {
            // otherwise, the position is now a past tracked position
            // so we update the aggregated variables
            _aggregatedFixedTokenBalance += currentPositionInfo_.fixedTokenBalance;
            _aggregatedVariableTokenBalance += currentPositionInfo_.variableTokenBalance;
            _aggregatedMargin += currentPositionInfo_.margin;
        }
    }

    function _removePositionFromTrackedPositions(uint256 positionIndex) internal {
        require (Time.blockTimestampScaled() <= _termEndTimestampWad, ExceptionsLibrary.FORBIDDEN);

        tickRangeToIndexPlusOne[abi.encode(trackedPositions[positionIndex])] = 0;
        if (positionIndex != trackedPositions.length - 1) {
            delete trackedPositions[positionIndex];
            trackedPositions[positionIndex] = trackedPositions[trackedPositions.length - 1];
            tickRangeToIndexPlusOne[abi.encode(trackedPositions[positionIndex])] = positionIndex + 1;
        }
        
        trackedPositions.pop();
    }
}
