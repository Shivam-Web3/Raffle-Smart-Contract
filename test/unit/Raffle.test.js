const { assert, expect } = require("chai")
const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const { networkConfig } = require("../../helper-hardhat-config")

const chainId = network.config.chainId

chainId != 31337
    ? describe.skip
    : describe("Raffle Unit Tests", function () {
          let raffle, deployer, vrfCoordinatorV2Mock, raffleEntranceFee, interval

          beforeEach(async function () {
              await deployments.fixture(["all"])
              deployer = (await getNamedAccounts()).deployer
              raffle = await ethers.getContract("Raffle", deployer)
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
              raffleEntranceFee = await raffle.getEnteranceFee()
              interval = await raffle.getInterval()
          })
          describe("constructor", function () {
              it("initializes contract correctly", async function () {
                  const raffleState = await raffle.getRaffleState()
                  assert.equal(raffleState.toString(), "0")
                  assert.equal(interval.toString(), networkConfig[chainId]["interval"])
              })
          })
          describe("enterRaffle", function () {
              it("reverts if not enough eth", async function () {
                  await expect(raffle.enterRaffle()).to.be.revertedWith("Raffle__SendMore")
              })
              it("make entries of persons", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  const player = await raffle.getPlayer(0)
                  assert.equal(player, deployer)
              })

              it("emits event once entered", async function () {
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(
                      raffle,
                      "RaffleEnter"
                  )
              })
              it("doesnt allow when raffle state is calculating", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", []) //.request can work too
                  //chainlink keeper pretend
                  await raffle.performUpkeep([]) // need to add raffle.address as consumer
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.be.revertedWith(
                      "Raffle__NotOpen"
                  )
              })
              describe("checkUpKeep", function () {
                  it("returns false if people haven't sent ETH", async function () {
                      await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                      await network.provider.send("evm_mine", [])
                      const upKeepNeeded = await raffle.checkUpkeep([]) // view function (no callStatic)
                      assert(!upKeepNeeded[0])
                  })
                  it("returns false if raffle isn't Open", async function () {
                      await raffle.enterRaffle({ value: raffleEntranceFee })
                      await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                      await network.provider.send("evm_mine", [])
                      await raffle.performUpkeep([])
                      const raffleState = await raffle.getRaffleState()
                      const upKeepNeeded = await raffle.checkUpkeep([])
                      assert.equal(raffleState.toString(), "1")
                      assert(!upKeepNeeded[0])
                  })
                  it("returns false if enough time hasn't passed", async () => {
                      await raffle.enterRaffle({ value: raffleEntranceFee })
                      await network.provider.send("evm_increaseTime", [interval.toNumber() - 2]) // need more info
                      await network.provider.request({ method: "evm_mine", params: [] })
                      const upKeepNeeded = await raffle.checkUpkeep("0x")
                      assert(!upKeepNeeded[0])
                  })
                  it("returns true if enough time has passed, has players, eth, and is open", async () => {
                      await raffle.enterRaffle({ value: raffleEntranceFee })
                      await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                      await network.provider.request({ method: "evm_mine", params: [] })
                      const upKeepNeeded = await raffle.checkUpkeep("0x")
                      assert(upKeepNeeded[0])
                  })
              })
              describe("performUpKeep", function () {
                  it("Runs only if checkupKeep is true", async () => {
                      await raffle.enterRaffle({ value: raffleEntranceFee })
                      await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                      await network.provider.request({ method: "evm_mine", params: [] })
                      const tx = await raffle.performUpkeep([])
                      assert(tx)
                  })
                  it("Reverts when checkupKeep is false", async () => {
                      await expect(raffle.performUpkeep([])).to.be.revertedWith(
                          "Raffle__UpkeepNotNeeded"
                      )
                  })
                  it("updates the raffle states,emits event, calls the vrfcordinator", async function () {
                      await raffle.enterRaffle({ value: raffleEntranceFee })
                      await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                      await network.provider.request({ method: "evm_mine", params: [] })
                      const txResponse = await raffle.performUpkeep([])
                      const txReceipt = await txResponse.wait(1)
                      const requestId = txReceipt.events[1].args.requestId
                      const raffleState = await raffle.getRaffleState()
                      assert(requestId.toNumber() > 0)
                      assert(raffleState.toString() == "1")
                  })
              })
              describe("fulfilRandomWords", function () {
                  beforeEach(async function () {
                      await raffle.enterRaffle({ value: raffleEntranceFee })
                      await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                      await network.provider.request({ method: "evm_mine", params: [] })
                      //   const txResponse = await raffle.performUpkeep([])
                  })
                  it("only be called after performUpKeep", async function () {
                      await expect(
                          vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address) //VRFCoordinatorV2Mock.sol calls fullfillRandomWordsOverride
                      ).to.be.revertedWith("nonexistent request")
                      await expect(
                          vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)
                      ).to.be.revertedWith("nonexistent request")
                  })
                  //BIG TEST
                  it("picks a winner, resets the lottery, and sends money", async function () {
                      const additionalEntrants = 3
                      const startingAccountIndex = 1 // deployer = 0
                      const accounts = await ethers.getSigners()
                      for (
                          let i = startingAccountIndex;
                          i < startingAccountIndex + additionalEntrants;
                          i++
                      ) {
                          const accountConnectedRaffle = raffle.connect(accounts[i])
                          await accountConnectedRaffle.enterRaffle({ value: raffleEntranceFee })
                      }
                      const startingTimeStamp = await raffle.getLatestTimeStamp()

                      await new Promise(async (resolve, reject) => {
                          raffle.once("WinnerPicked", async () => {
                              try {
                                  const recentWinner = await raffle.getRecentWinner()
                                  //   console.log(recentWinner)
                                  //   console.log(accounts[0].address)
                                  //   console.log(accounts[1].address)
                                  //   console.log(accounts[2].address)
                                  //   console.log(accounts[3].address)
                                  const raffleState = await raffle.getRaffleState()
                                  const endingTimeStamp = await raffle.getLatestTimeStamp()
                                  const numPlayers = await raffle.getNumberOfPlayers()
                                  const winnerEndingBalance = await accounts[1].getBalance()
                                  assert(numPlayers.toString() == "0")
                                  assert(raffleState.toString() == "0")
                                  assert(endingTimeStamp > startingTimeStamp)
                                  assert(
                                      winnerEndingBalance.toString() ==
                                          winnerStartingBalance
                                              .add(raffleEntranceFee.mul(additionalEntrants + 1))
                                              .toString()
                                  )
                              } catch (e) {
                                  reject(e)
                              }
                              resolve()
                          })
                          //mock chainlink keepers
                          const tx = await raffle.performUpkeep([])
                          const txReceipt = await tx.wait(1)
                          const winnerStartingBalance = await accounts[1].getBalance()
                          //mock chainlink VRF
                          await vrfCoordinatorV2Mock.fulfillRandomWords(
                              txReceipt.events[1].args.requestId,
                              raffle.address
                          )
                      })
                  })
              })
          })
      })
