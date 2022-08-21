const { assert, expect } = require("chai")
const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const { networkConfig } = require("../../helper-hardhat-config")

const chainId = network.config.chainId

chainId == 31337
    ? describe.skip
    : describe("Raffle Staging Tests", function () {
          let raffle, deployer, raffleEntranceFee

          beforeEach(async function () {
              //   await deployments.fixture(["raffle"])
              deployer = (await getNamedAccounts()).deployer
              raffle = await ethers.getContract("Raffle", deployer)
              raffleEntranceFee = await raffle.getEnteranceFee()
          })
          describe("fulfillRandomWords", function () {
              it("Works with live Chainlink VRF and Keepers, picks a random Winner", async function () {
                  console.log("Setting up test...")
                  const startingTimeStamp = await raffle.getLatestTimeStamp()
                  const accounts = await ethers.getSigners()

                  console.log("Setting up Listener...")
                  await new Promise(async (resolve, reject) => {
                      // setup listener before we enter the raffle
                      raffle.once("WinnerPicked", async () => {
                          console.log("Winner Picked i.e event fired")
                          try {
                              const recentWinner = await raffle.getRecentWinner()
                              const raffleState = await raffle.getRaffleState()
                              const winnerEndingBalace = await accounts[0].getBalance()
                              const endingTimeStamp = await raffle.getLatestTimeStamp()

                              await expect(raffle.getPlayer(0)).to.be.reverted //array reset
                              assert(recentWinner.toString() == accounts[0].address)
                              assert(raffleState.toString() == "0")
                              assert(
                                  winnerEndingBalace.toString() ==
                                      winnerStartingBalance.add(raffleEntranceFee.toString())
                              )
                              assert(endingTimeStamp > startingTimeStamp)
                              resolve()
                          } catch (e) {
                              reject(e)
                          }
                      })
                      //raffle enter
                      console.log("Entering Raffle...")
                      const tx = await raffle.enterRaffle({ value: raffleEntranceFee + 1 }) // just a lil more
                      await tx.wait(1)
                      const winnerStartingBalance = await accounts[0].getBalance()
                  })
              })
          })
      })
