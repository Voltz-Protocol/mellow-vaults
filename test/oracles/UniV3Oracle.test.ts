import hre from "hardhat";
import { ethers, deployments } from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";
import { contract } from "../library/setup";
import { ERC20RootVault } from "../types/ERC20RootVault";
import { expect } from "chai";
import Common from "../library/Common";

import { UniV3Oracle, IUniswapV3Pool, IUniswapV3Factory } from "../types";

import {
    ERC165_INTERFACE_ID,
    UNIV2_ORACLE_INTERFACE_ID,
    UNIV3_ORACLE_INTERFACE_ID,
} from "../library/Constants";
import { ADDRESS_ZERO, TickMath } from "@uniswap/v3-sdk";
import Exceptions from "../library/Exceptions";

type CustomContext = {
    uniV3Oracle: UniV3Oracle;
    uniswapV3Factory: IUniswapV3Factory;
};

type DeployOptions = {};

contract<ERC20RootVault, DeployOptions, CustomContext>(
    "UniV3Oracle",
    function () {
        before(async () => {
            this.deploymentFixture = deployments.createFixture(
                async (_, __?: DeployOptions) => {
                    this.uniV3Oracle = await ethers.getContract("UniV3Oracle");

                    const { uniswapV3Factory } = await hre.getNamedAccounts();
                    this.uniswapV3Factory = await hre.ethers.getContractAt(
                        "IUniswapV3Factory",
                        uniswapV3Factory
                    );
                    return this.subject;
                }
            );
        });

        beforeEach(async () => {
            await this.deploymentFixture();
        });

        describe.only("#contructor", () => {
            it("creates UniV3Oracle", async () => {
                expect(ethers.constants.AddressZero).to.not.eq(
                    this.uniV3Oracle.address
                );
                expect(ethers.constants.AddressZero).to.not.eq(
                    await this.uniV3Oracle.factory()
                );
            });

            it("initializes UniV3Oracle name", async () => {
                expect("UniV3Oracle").to.be.eq(
                    await this.uniV3Oracle.contractName()
                );
            });

            it("initializes UniV3Oracle version", async () => {
                expect("1.0.0").to.be.eq(
                    await this.uniV3Oracle.contractVersion()
                );
            });
        });

        describe.only("#price", () => {
            it("empty response if pools index is zero", async () => {
                const pricesResult = await this.uniV3Oracle.price(
                    this.usdc.address,
                    ADDRESS_ZERO,
                    BigNumber.from(30)
                );

                const pricesX96 = pricesResult.pricesX96;
                const safetyIndices = pricesResult.safetyIndices;
                expect(pricesX96.length).to.be.eq(0);
                expect(safetyIndices.length).to.be.eq(0);
            });

            it("non-empty response", async () => {
                for (var setBitsCount = 0; setBitsCount < 5; setBitsCount++) {
                    const mask = BigNumber.from((1 << (setBitsCount + 1)) - 2);
                    const pricesResult = await this.uniV3Oracle.price(
                        this.usdc.address,
                        this.weth.address,
                        mask
                    );

                    const pricesX96 = pricesResult.pricesX96;
                    const safetyIndices = pricesResult.safetyIndices;

                    expect(pricesX96.length).to.be.eq(setBitsCount);
                    expect(safetyIndices.length).to.be.eq(setBitsCount);
                    for (var i = 0; i < safetyIndices.length; i++) {
                        expect(safetyIndices[i]).to.be.eq(
                            BigNumber.from(i + 1)
                        );
                    }
                }
            });
        });

        describe.only("#supportsInterface", () => {
            it(`returns true for ERC165 interface (${ERC165_INTERFACE_ID})`, async () => {
                let isSupported = await this.uniV3Oracle.supportsInterface(
                    ERC165_INTERFACE_ID
                );
                expect(isSupported).to.be.true;
            });

            it(`returns true for IUniV3Oracle interface (${UNIV3_ORACLE_INTERFACE_ID})`, async () => {
                let isSupported = await this.uniV3Oracle.supportsInterface(
                    UNIV3_ORACLE_INTERFACE_ID
                );
                expect(isSupported).to.be.true;
            });

            it("returns false when contract does not support the given interface", async () => {
                let isSupported = await this.uniV3Oracle.supportsInterface(
                    UNIV2_ORACLE_INTERFACE_ID
                );
                expect(isSupported).to.be.false;
            });
        });

        const mulDivFromFullMath = (
            a: BigNumber,
            b: BigNumber,
            denominator: BigNumber
        ) => {
            return a.mul(b).div(denominator);
        };

        const calculateCorrectValuesForMask = async (
            token0: string,
            token1: string,
            poolUsdcWeth: IUniswapV3Pool,
            safetyIndexes: number
        ) => {
            const [
                spotSqrtPriceX96,
                ,
                observationIndex,
                observationCardinality,
            ] = await poolUsdcWeth.slot0();
            var correctPricesX96: BigNumber[] = [];
            var correctSafetyIndexes: BigNumber[] = [];
            const avgs: number[] = [
                await this.uniV3Oracle.LOW_OBS(),
                await this.uniV3Oracle.MID_OBS(),
                await this.uniV3Oracle.HIGH_OBS(),
            ];

            if (((safetyIndexes >> 1) & 1) > 0) {
                correctPricesX96.push(spotSqrtPriceX96);
                correctSafetyIndexes.push(BigNumber.from(1));
            }

            for (var i = 2; i < 5; i++) {
                if (((safetyIndexes >> i) & 1) == 0) {
                    continue;
                }
                const bfAvg = avgs[i - 2];
                if (observationCardinality < bfAvg) {
                    continue;
                }
                const obs1 = BigNumber.from(observationIndex)
                    .add(BigNumber.from(observationCardinality))
                    .sub(BigNumber.from(1))
                    .mod(BigNumber.from(observationCardinality));

                const obs0 = BigNumber.from(observationIndex)
                    .add(BigNumber.from(observationCardinality))
                    .sub(BigNumber.from(bfAvg))
                    .mod(BigNumber.from(observationCardinality));

                const [timestamp0, tick0, ,] = await poolUsdcWeth.observations(
                    obs0
                );
                const [timestamp1, tick1, ,] = await poolUsdcWeth.observations(
                    obs1
                );
                const timespan = timestamp1 - timestamp0;
                const tickAverage = tick1.sub(tick0).div(timespan);
                correctPricesX96.push(
                    BigNumber.from(
                        TickMath.getSqrtRatioAtTick(
                            tickAverage.toNumber()
                        ).toString()
                    )
                );
                correctSafetyIndexes.push(BigNumber.from(i));
            }

            var revTokens = token0 > token1;
            for (var i = 0; i < correctPricesX96.length; i++) {
                if (revTokens) {
                    correctPricesX96[i] = mulDivFromFullMath(
                        Common.Q96,
                        Common.Q96,
                        correctPricesX96[i]
                    );
                }
                correctPricesX96[i] = mulDivFromFullMath(
                    correctPricesX96[i],
                    correctPricesX96[i],
                    Common.Q96
                );
            }

            return [correctPricesX96, correctSafetyIndexes];
        };

        const testForFeeAndMask = async (
            fee: number,
            safetyIndicesSet: number,
            correctResultSize: number
        ) => {
            it(`test adding [weth, usdc] pools with fee = ${fee}`, async () => {
                const token0 = this.weth.address;
                const token1 = this.usdc.address;

                const poolWethUsdcAddress = await this.uniswapV3Factory.getPool(
                    token0,
                    token1,
                    fee
                );

                await this.uniV3Oracle
                    .connect(this.admin)
                    .addUniV3Pools([poolWethUsdcAddress]);
                const poolUsdcWeth: IUniswapV3Pool = await ethers.getContractAt(
                    "IUniswapV3Pool",
                    poolWethUsdcAddress
                );

                expect(await poolUsdcWeth.fee()).to.be.eq(fee);
                // revesed
                expect(await poolUsdcWeth.token0()).to.be.eq(token1);
                expect(await poolUsdcWeth.token1()).to.be.eq(token0);

                var [correctPricesX96, correctSafetyIndexes] =
                    await calculateCorrectValuesForMask(
                        token0,
                        token1,
                        poolUsdcWeth,
                        safetyIndicesSet
                    );
                const pricesResult = await this.uniV3Oracle.price(
                    token0,
                    token1,
                    safetyIndicesSet
                );

                const pricesX96 = pricesResult.pricesX96;
                const safetyIndexes = pricesResult.safetyIndices;
                expect(pricesX96.length).to.be.eq(correctResultSize);
                expect(safetyIndexes.length).to.be.eq(correctResultSize);
                for (var i = 0; i < correctResultSize; i++) {
                    expect(correctPricesX96[i]).to.be.eq(pricesX96[i]);
                    expect(correctSafetyIndexes[i]).to.be.eq(safetyIndexes[i]);
                }
            });
        };

        describe.only("#addUniV3Pools", () => {
            [500, 3000].forEach(
                async (fee) => await testForFeeAndMask(fee, 30, 4)
            );
            [10000].forEach(async (fee) => await testForFeeAndMask(fee, 16, 0));
        });

        describe.only("#edge cases", () => {
            it(`price function reverts with ${Exceptions.INVALID_VALUE} when adding [weth, usdc] pools with fee = 10000`, async () => {
                const token0 = this.weth.address;
                const token1 = this.usdc.address;
                const poolWethUsdcAddress = await this.uniswapV3Factory.getPool(
                    token0,
                    token1,
                    10000
                );

                await this.uniV3Oracle
                    .connect(this.admin)
                    .addUniV3Pools([poolWethUsdcAddress]);
                const safetyIndicesSet = BigNumber.from(30);
                await expect(
                    this.uniV3Oracle.price(token0, token1, safetyIndicesSet)
                ).to.be.revertedWith(Exceptions.INVALID_VALUE);
            });
        });
    }
);
