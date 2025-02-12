/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable no-unused-expressions */
import { ethers, waffle } from 'hardhat'
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { testConfig } from './test-helpers'
import type { NFTBoilMerkleA } from '../typechain-types'
import type { BigNumber, BytesLike } from 'ethers'
import { expect } from 'chai'
import { MerkleTree } from 'merkletreejs'
import keccak256 from 'keccak256'
const provider = waffle.provider

describe(`NFTBoilMerkleA contract`, function () {
  let owner: SignerWithAddress
  let bob: SignerWithAddress
  let bobs: NFTBoilMerkleA
  let alis: SignerWithAddress
  let ads: NFTBoilMerkleA
  let ad: NFTBoilMerkleA

  beforeEach(async function () {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    [owner, bob, alis] = await ethers.getSigners()
    const contract = await ethers.getContractFactory('NFTBoilMerkleA')
    ad = (await contract.deploy('NFTBoilMerkleA', 'BOILA')) as NFTBoilMerkleA
    await ad.deployed()
    bobs = ad.connect(bob)
    ads = ad.connect(alis)

    // Ensure contract is paused/disabled on deployment
    expect(await ad.presale()).to.equal(true)
  })

  describe('Basic checks', function () {
    it('check the owner', async function () {
      expect(await ad.owner()).to.equal(owner.address)
    })

    it('check default is PreSale', async function () {
      expect(await ad.presale()).to.equal(true)
    })

    it('check default is Mintable', async function () {
      expect(await ad.mintable()).to.equal(false)
    })

    it('check default is NOT publicSaleWithoutProof', async function () {
      expect(await ad.publicSaleWithoutProof()).to.equal(false)
    })

    it('Confirm pre price', async function () {
      const cost = ethers.utils.parseUnits(testConfig.price_pre.toString())
      expect(await ad.getCurrentCost()).to.equal(cost)
    })

    it('Confirm public price', async function () {
      const cost = ethers.utils.parseUnits(testConfig.price.toString())
      await ad.setPresale(false)
      expect(await ad.getCurrentCost()).to.equal(cost)
    })

    it('Confirm maxPerWallet', async function () {
      const maxPerWallet = testConfig.max_per_wallet.toString()
      expect(await ad.maxPerWallet()).to.equal(maxPerWallet)
    })

    it('Confirm publicMaxPerTx', async function () {
      const publicMaxPerTx = testConfig.public_max_per_tx.toString()
      expect(await ad.publicMaxPerTx()).to.equal(publicMaxPerTx)
    })
  })

  describe('Setter checks', function () {
    it('check not owner fail setPublicSaleWithoutProof', async function () {
      await expect(
        ad.connect(bob).setPublicSaleWithoutProof(true)
      ).to.be.revertedWith('Ownable: caller is not the owner')
    })
    it('check owner can setPublicSaleWithoutProof', async function () {
      await expect(ad.setPublicSaleWithoutProof(true)).not.to.be.reverted
      expect(await ad.publicSaleWithoutProof()).to.equal(true)
    })

    it('check not owner fail setMaxPerWallet', async function () {
      await expect(ad.connect(bob).setMaxPerWallet(600)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      )
    })
    it('check owner can setMaxPerWallet', async function () {
      await expect(ad.setMaxPerWallet(700)).not.to.be.reverted
      expect(await ad.maxPerWallet()).to.equal(700)
    })

    it('check not owner fail setPublicMaxPerTx', async function () {
      await expect(ad.connect(bob).setPublicMaxPerTx(7)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      )
    })
    it('check owner can setPublicMaxPerTx', async function () {
      await expect(ad.setPublicMaxPerTx(8)).not.to.be.reverted
      expect(await ad.publicMaxPerTx()).to.equal(8)
    })
  })

  describe('Public Minting checks', function () {
    let rootTreePublicMint
    let addresses: string[]
    let leaves: Buffer[]
    let hexProofsPublicMint: BytesLike[][]
    let publicSaleMaxes: number[]
    let mintCost: BigNumber

    beforeEach(async function () {
      await ad.setMintable(true)
      await ad.setPresale(false)

      addresses = [owner.address, bob.address, alis.address]
      publicSaleMaxes = [100, 10, 5]
      leaves = createLeaves(addresses, publicSaleMaxes)
      const tree = new MerkleTree(leaves, keccak256, { sortPairs: true })
      rootTreePublicMint = tree.getRoot()
      await ad.setMerkleRootPublicMint(rootTreePublicMint)

      hexProofsPublicMint = leaves.map((x) => tree.getHexProof(x))
    })

    it('PublicMint fail if presale is active', async () => {
      const degenCost = await ad.getCurrentCost()
      await ad.setPresale(true)
      await expect(
        ad
          .connect(bob)
          .publicMint(1, publicSaleMaxes[1]!, hexProofsPublicMint[1]!, {
            value: degenCost,
          })
      ).to.be.revertedWith('Presale is active.')
    })

    it('PublicSaleWithoutProof fail if presale is active', async () => {
      const degenCost = await ad.getCurrentCost()
      await ad.setPresale(true)
      await expect(
        ad.connect(bob).publicMintWithoutProof(1, {
          value: degenCost,
        })
      ).to.be.revertedWith('Presale is active.')
    })

    it('Non-owner cannot mint without enough balance', async () => {
      const degenCost = await ad.getCurrentCost()
      await expect(
        ad
          .connect(bob)
          .publicMint(1, publicSaleMaxes[1]!, hexProofsPublicMint[1]!, {
            value: degenCost.sub(1),
          })
      ).to.be.reverted
    })

    it('Owner and Bob mint', async () => {
      const degenCost = await ad.getCurrentCost()
      expect(await ad.totalSupply(), 'initialSupply').to.equal(
        testConfig.initialSupply
      )

      let tokenId = await (await ad.totalSupply()).add(1)
      await expect(
        ad
          .connect(owner)
          .publicMint(1, publicSaleMaxes[0]!, hexProofsPublicMint[0]!, {
            value: degenCost,
          })
      )
        .to.emit(ad, 'Transfer')
        .withArgs(ethers.constants.AddressZero, owner.address, tokenId)

      expect(await ad.totalSupply(), 'initialSupply + 1').to.equal(
        testConfig.initialSupply + 1
      )

      tokenId = await (await ad.totalSupply()).add(1)
      await expect(
        ad
          .connect(bob)
          .publicMint(1, publicSaleMaxes[1]!, hexProofsPublicMint[1]!, {
            value: degenCost,
          })
      )
        .to.emit(ad, 'Transfer')
        .withArgs(ethers.constants.AddressZero, bob.address, tokenId)

      expect(await ad.totalSupply(), 'initialSupply + 2').to.equal(
        testConfig.initialSupply + 2
      )
    })

    it('Minting tokens increased contract balance', async () => {
      const degenCost = await ad.getCurrentCost()

      // Mint first token and expect a balance increase
      expect(
        await ad
          .connect(owner)
          .publicMint(1, publicSaleMaxes[0]!, hexProofsPublicMint[0]!, {
            value: degenCost,
          })
      ).to.be.ok
      expect(await provider.getBalance(ad.address)).to.equal(degenCost)

      // Mint two additonal tokens and expect increase again
      expect(
        await ad
          .connect(owner)
          .publicMint(2, publicSaleMaxes[0]!, hexProofsPublicMint[0]!, {
            value: degenCost.mul(2),
          })
      ).to.be.ok
      expect(await provider.getBalance(ad.address)).to.equal(degenCost.mul(3))
    })

    it('Bob mints ' + testConfig.public_max_per_tx, async () => {
      const degenCost = await ad.getCurrentCost()
      const tokenId = await ad.totalSupply()

      await expect(
        ad
          .connect(bob)
          .publicMint(
            testConfig.public_max_per_tx,
            publicSaleMaxes[1]!,
            hexProofsPublicMint[1]!,
            {
              value: degenCost.mul(testConfig.public_max_per_tx),
            }
          )
      )
        .to.emit(ad, 'Transfer')
        .withArgs(
          ethers.constants.AddressZero,
          bob.address,
          tokenId.add(testConfig.public_max_per_tx - 1)
        )
    })

    it('Bob mints 1 plus ' + (testConfig.public_max_per_tx - 1), async () => {
      const degenCost = await ad.getCurrentCost()
      const tokenId = await (await ad.totalSupply()).add(1)

      await expect(
        ad
          .connect(bob)
          .publicMint(1, publicSaleMaxes[1]!, hexProofsPublicMint[1]!, {
            value: degenCost.mul(1),
          })
      )
        .to.emit(ad, 'Transfer')
        .withArgs(ethers.constants.AddressZero, bob.address, tokenId)

      await expect(
        ad
          .connect(bob)
          .publicMint(
            testConfig.public_max_per_tx - 1,
            publicSaleMaxes[1]!,
            hexProofsPublicMint[1]!,
            {
              value: degenCost.mul(testConfig.public_max_per_tx - 1),
            }
          )
      )
        .to.emit(ad, 'Transfer')
        .withArgs(
          ethers.constants.AddressZero,
          bob.address,
          tokenId.add(testConfig.public_max_per_tx - 1)
        )
    })

    it('Bob fails to mints ' + (testConfig.public_max_per_tx + 1), async () => {
      const degenCost = await ad.getCurrentCost()
      await expect(
        ad
          .connect(bob)
          .publicMint(
            publicSaleMaxes[1]! + 1,
            publicSaleMaxes[1]!,
            hexProofsPublicMint[1]!,
            {
              value: degenCost.mul(publicSaleMaxes[1]! + 1),
            }
          )
      ).to.be.revertedWith('Already claimed max')
    })

    it('Bob fails to mints when paused', async () => {
      const cost = await ad.getCurrentCost()
      await ad.pause()

      await expect(
        ad
          .connect(bob)
          .publicMint(
            publicSaleMaxes[1]!,
            publicSaleMaxes[1]!,
            hexProofsPublicMint[1]!,
            {
              value: cost.mul(publicSaleMaxes[1]!),
            }
          )
      ).to.be.revertedWith('Pausable: paused')
      await ad.unpause()
      expect(
        await ad
          .connect(bob)
          .publicMint(1, publicSaleMaxes[1]!, hexProofsPublicMint[1]!, {
            value: cost,
          })
      ).to.be.ok
    })

    it('Non registerd user cant buy on PublicSale', async () => {
      const cost = await ad.getCurrentCost()
      addresses = [alis.address]
      publicSaleMaxes = [5]
      leaves = createLeaves(addresses, publicSaleMaxes)
      const tree = new MerkleTree(leaves, keccak256, { sortPairs: true })
      rootTreePublicMint = tree.getRoot()
      await ad.setMerkleRootPublicMint(rootTreePublicMint)

      hexProofsPublicMint = leaves.map((x) => tree.getHexProof(x))

      await expect(
        ad
          .connect(bob)
          .publicMint(1, publicSaleMaxes[0]!, hexProofsPublicMint[0]!, {
            value: cost,
          })
      ).to.be.revertedWith('Invalid Merkle Proof')

      await expect(
        ad
          .connect(owner)
          .publicMint(1, publicSaleMaxes[0]!, hexProofsPublicMint[0]!, {
            value: cost,
          })
      ).to.be.revertedWith('Invalid Merkle Proof')

      expect(
        await ads.publicMint(1, publicSaleMaxes[0]!, hexProofsPublicMint[0]!, {
          value: cost,
        })
      ).to.be.ok
    })

    it('Bob fails to mints 2 with funds for 1', async () => {
      const degenCost = await ad.getCurrentCost()

      await expect(
        ad
          .connect(bob)
          .publicMint(2, publicSaleMaxes[1]!, hexProofsPublicMint[1]!, {
            value: degenCost,
          })
      ).to.be.revertedWith('Not enough funds')
    })

    it('Public Sale Price Boundary Check', async () => {
      const cost = ethers.utils.parseUnits(testConfig.price.toString())
      expect(
        await bobs.publicMint(1, publicSaleMaxes[1]!, hexProofsPublicMint[1]!, {
          value: cost,
        })
      ).to.be.ok
      expect(
        await bobs.publicMint(1, publicSaleMaxes[1]!, hexProofsPublicMint[1]!, {
          value: cost.add(1),
        })
      ).to.be.ok
      await expect(
        bobs.publicMint(1, publicSaleMaxes[1]!, hexProofsPublicMint[1]!, {
          value: cost.sub(1),
        })
      ).to.be.revertedWith('Not enough funds')
    })

    it('Public Sale Price Change Check', async () => {
      const cost = ethers.utils.parseUnits('0.001')
      expect(await ad.setPublicCost(cost))
      expect(
        await bobs.publicMint(1, publicSaleMaxes[1]!, hexProofsPublicMint[1]!, {
          value: cost,
        })
      ).to.be.ok
      expect(
        await bobs.publicMint(1, publicSaleMaxes[1]!, hexProofsPublicMint[1]!, {
          value: cost.add(1),
        })
      ).to.be.ok
      await expect(
        ad
          .connect(bob)
          .publicMint(1, publicSaleMaxes[1]!, hexProofsPublicMint[1]!, {
            value: cost.sub(1),
          })
      ).to.be.revertedWith('Not enough funds')
    })

    it(`Max mint Public Sale Price Boundary Check`, async () => {
      const cost = ethers.utils.parseUnits(testConfig.price.toString())
      expect(
        await ad
          .connect(owner)
          .publicMint(
            testConfig.public_max_per_tx,
            publicSaleMaxes[0]!,
            hexProofsPublicMint[0]!,
            {
              value: cost.mul(testConfig.public_max_per_tx),
            }
          )
      ).to.be.ok

      expect(
        await bobs.publicMint(
          testConfig.public_max_per_tx,
          publicSaleMaxes[1]!,
          hexProofsPublicMint[1]!,
          {
            value: cost.mul(testConfig.public_max_per_tx).add(1),
          }
        )
      ).to.be.ok

      await expect(
        ads.publicMint(
          publicSaleMaxes[2]!,
          publicSaleMaxes[2]!,
          hexProofsPublicMint[2]!,
          {
            value: cost.mul(publicSaleMaxes[2]!).sub(1),
          }
        )
      ).to.be.revertedWith('Not enough funds')
    })

    // same price so its cant test
    it('Pre Sale price can not buy', async () => {
      const cost = ethers.utils.parseUnits(testConfig.price_pre.toString())
      await expect(
        ad
          .connect(bob)
          .publicMint(1, publicSaleMaxes[1]!, hexProofsPublicMint[1]!, {
            value: cost.sub(1),
          })
      ).to.be.revertedWith('Not enough funds')
    })

    it('Public sale have wallet restriction', async () => {
      const cost = await ad.getCurrentCost()

      expect(
        await bobs.publicMint(
          testConfig.public_max_per_tx,
          publicSaleMaxes[1]!,
          hexProofsPublicMint[1]!,
          {
            value: cost.mul(testConfig.public_max_per_tx),
          }
        )
      ).to.be.ok
      expect(
        await bobs.publicMint(
          testConfig.public_max_per_tx,
          publicSaleMaxes[1]!,
          hexProofsPublicMint[1]!,
          {
            value: cost.mul(testConfig.public_max_per_tx),
          }
        )
      ).to.be.ok

      await expect(
        ad
          .connect(bob)
          .publicMint(1, publicSaleMaxes[1]!, hexProofsPublicMint[1]!, {
            value: cost,
          })
      ).to.be.revertedWith('Already claimed max')
    })
  })

  describe('Whitelist checks', function () {
    let rootTreePreMint
    let addresses: string[]
    let leaves: Buffer[]
    let hexProofsPreMint: BytesLike[][]
    let presaleMaxes: number[]
    let mintCost: BigNumber

    beforeEach(async function () {
      await ad.setMintable(true)
      mintCost = await ad.getCurrentCost()

      addresses = [alis.address]
      leaves = createLeaves(addresses, [5])
      const tree = new MerkleTree(leaves, keccak256, { sortPairs: true })
      rootTreePreMint = tree.getRoot()
      await ad.setMerkleRootPreMint(rootTreePreMint)

      hexProofsPreMint = [owner.address, bob.address, alis.address].map((x) => {
        return tree.getHexProof(keccak256(x))
      })
      presaleMaxes = [5, 5, 5]
    })

    // it('leaf check getLeaf', async function () {
    //   expect(
    //     await ads.getLeaf()
    //   ).to.equal(leaves[0]?.toString('hex'))

    // })

    // it('leaf check getLeafWithPreMintMax', async () => {
    //   expect(
    //     await ads.getLeafWithPreMintMax(5)
    //   ).to.equal("0x" + leaves[0]?.toString('hex'))

    // })

    it('Non Whitelisted user cant buy on PreSale', async () => {
      await expect(
        ad.connect(bob).preMint(1, presaleMaxes[1]!, hexProofsPreMint[1]!, {
          value: mintCost,
        })
      ).to.be.revertedWith('Invalid Merkle Proof')

      await expect(
        ad.connect(owner).preMint(1, presaleMaxes[0]!, hexProofsPreMint[0]!, {
          value: mintCost,
        })
      ).to.be.revertedWith('Invalid Merkle Proof')

      expect(
        await ads.preMint(1, presaleMaxes[2]!, hexProofsPreMint[2]!, {
          value: mintCost,
        })
      ).to.be.ok
    })

    it("Presale can't open on PublicSale", async () => {
      await ad.setPresale(false)
      await expect(
        ad.connect(bob).preMint(1, presaleMaxes[1]!, hexProofsPreMint[1]!, {
          value: mintCost,
        })
      ).to.be.revertedWith('Presale is not active.')
    })

    it('Whitelisted multi user set', async () => {
      addresses = [owner.address, bob.address, alis.address]
      presaleMaxes = [5, 5, 5]
      leaves = createLeaves(addresses, presaleMaxes)
      const tree = new MerkleTree(leaves, keccak256, { sortPairs: true })
      rootTreePreMint = tree.getRoot()
      await ad.setMerkleRootPreMint(rootTreePreMint)

      hexProofsPreMint = leaves.map((x) => tree.getHexProof(x))

      expect(
        await ad
          .connect(owner)
          .preMint(1, presaleMaxes[0]!, hexProofsPreMint[0]!, {
            value: mintCost,
          })
      ).to.be.ok
      expect(
        await bobs.preMint(1, presaleMaxes[1]!, hexProofsPreMint[1]!, {
          value: mintCost,
        })
      ).to.be.ok
      expect(
        await ads.preMint(1, presaleMaxes[2]!, hexProofsPreMint[2]!, {
          value: mintCost,
        })
      ).to.be.ok
    })

    it(`Whitelisted user can purchase as many as they are allocated.`, async () => {
      const buyCost = (await ad.getCurrentCost()).mul(presaleMaxes[2]!)

      expect(
        await ads.preMint(
          presaleMaxes[2]!,
          presaleMaxes[2]!,
          hexProofsPreMint[2]!,
          {
            value: buyCost,
          }
        )
      ).to.be.ok
      await expect(
        ads.preMint(1, presaleMaxes[2]!, hexProofsPreMint[2]!, {
          value: buyCost,
        })
      ).to.be.revertedWith('Already claimed max')
    })

    it('Whitelisted user can buy 3 + 2', async () => {
      mintCost = (await ad.getCurrentCost()).mul(3)
      expect(
        await ads.preMint(3, presaleMaxes[2]!, hexProofsPreMint[2]!, {
          value: mintCost,
        })
      ).to.be.ok
      expect(
        await ads.preMint(2, presaleMaxes[2]!, hexProofsPreMint[2]!, {
          value: mintCost,
        })
      ).to.be.ok
      await expect(
        ad.connect(alis).preMint(1, presaleMaxes[2]!, hexProofsPreMint[2]!, {
          value: mintCost,
        })
      ).to.be.revertedWith('Already claimed max')
    })

    it('Whitelisted user can not buy over WL', async () => {
      const amount = presaleMaxes[2]! + 1
      const cost = (await ad.getCurrentCost()).mul(amount)
      await expect(
        ad
          .connect(alis)
          .preMint(amount, presaleMaxes[2]!, hexProofsPreMint[2]!, {
            value: cost,
          })
      ).to.be.revertedWith('Already claimed max')
    })

    it('Whitelisted fails to mints when paused', async () => {
      const cost = await ad.getCurrentCost()
      await ad.pause()

      await expect(
        ad.connect(alis).preMint(1, presaleMaxes[2]!, hexProofsPreMint[2]!, {
          value: cost,
        })
      ).to.be.revertedWith('Pausable: paused')
      await ad.unpause()
      expect(
        await ads.preMint(1, presaleMaxes[2]!, hexProofsPreMint[2]!, {
          value: cost,
        })
      ).to.ok
    })

    it('Non WhiteList user block after Whitelisted user buy', async () => {
      const amount = presaleMaxes[2]!
      mintCost = (await ad.getCurrentCost()).mul(amount)
      expect(
        await ads.preMint(amount, presaleMaxes[2]!, hexProofsPreMint[2]!, {
          value: mintCost,
        })
      ).to.ok
      await expect(
        ad.connect(alis).preMint(1, presaleMaxes[2]!, hexProofsPreMint[2]!, {
          value: mintCost,
        })
      ).to.be.revertedWith('Already claimed max')
      await expect(
        ad.connect(bob).preMint(1, presaleMaxes[1]!, hexProofsPreMint[1]!, {
          value: mintCost,
        })
      ).to.be.revertedWith('Invalid Merkle Proof')
    })

    it('Whitelisted presaleMaxes Check', async () => {
      addresses = [owner.address, bob.address, alis.address]
      presaleMaxes = [0, 1, 2]
      leaves = createLeaves(addresses, presaleMaxes)
      const tree = new MerkleTree(leaves, keccak256, { sortPairs: true })
      rootTreePreMint = tree.getRoot()
      await ad.setMerkleRootPreMint(rootTreePreMint)

      hexProofsPreMint = leaves.map((x) => tree.getHexProof(x))

      await expect(
        ad.connect(owner).preMint(1, presaleMaxes[1]!, hexProofsPreMint[0]!, {
          value: mintCost,
        }),
        'Incorrect presaleMaxes'
      ).to.be.revertedWith('Invalid Merkle Proof')

      await expect(
        ad.connect(owner).preMint(1, presaleMaxes[1]!, hexProofsPreMint[1]!, {
          value: mintCost,
        }),
        'Incorrect hexProofs'
      ).to.be.revertedWith('Invalid Merkle Proof')

      await expect(
        ad.connect(owner).preMint(1, presaleMaxes[0]!, hexProofsPreMint[0]!, {
          value: mintCost,
        }),
        'presaleMaxes = 0 can not preMint'
      ).to.be.revertedWith('Already claimed max')

      await expect(
        bobs.preMint(2, presaleMaxes[1]!, hexProofsPreMint[1]!, {
          value: mintCost.mul(2),
        }),
        'You can not buy more than presaleMaxes'
      ).to.be.revertedWith('Already claimed max')

      expect(
        await bobs.preMint(1, presaleMaxes[1]!, hexProofsPreMint[1]!, {
          value: mintCost,
        }),
        'You can buy presaleMaxes exactly'
      ).to.be.ok

      await expect(
        bobs.preMint(1, presaleMaxes[1]!, hexProofsPreMint[1]!, {
          value: mintCost,
        }),
        'Cannot buy if you have already bought up to the presaleMaxes.'
      ).to.be.revertedWith('Already claimed max')

      expect(
        await ads.preMint(1, presaleMaxes[2]!, hexProofsPreMint[2]!, {
          value: mintCost,
        }),
        'You can buy less than presaleMaxes'
      ).to.be.ok

      await expect(
        ads.preMint(2, presaleMaxes[2]!, hexProofsPreMint[2]!, {
          value: mintCost.mul(2),
        }),
        'You can not buy more than presaleMaxes.'
      ).to.be.revertedWith('Already claimed max')

      await expect(
        ads.preMint(10, presaleMaxes[2]!, hexProofsPreMint[2]!, {
          value: mintCost.mul(10),
        }),
        'You can not buy more than presaleMaxes.'
      ).to.be.revertedWith('Already claimed max')

      expect(
        await ads.preMint(1, presaleMaxes[2]!, hexProofsPreMint[2]!, {
          value: mintCost,
        }),
        'You can buy presaleMaxes exactly.'
      ).to.be.ok

      await expect(
        ads.preMint(1, presaleMaxes[2]!, hexProofsPreMint[2]!, {
          value: mintCost,
        }),
        'You can not buy more than presaleMaxes.'
      ).to.be.revertedWith('Already claimed max')

      await expect(
        ads.preMint(10, presaleMaxes[2]!, hexProofsPreMint[2]!, {
          value: mintCost.mul(10),
        }),
        'You can not buy more than presaleMaxes'
      ).to.be.revertedWith('Already claimed max')
    })

    it('High volume purchases on preMint', async () => {
      addresses = [owner.address, bob.address, alis.address]
      presaleMaxes = [11, 20, 200]
      leaves = createLeaves(addresses, presaleMaxes)
      const tree = new MerkleTree(leaves, keccak256, { sortPairs: true })
      rootTreePreMint = tree.getRoot()
      await ad.setMerkleRootPreMint(rootTreePreMint)

      hexProofsPreMint = leaves.map((x) => tree.getHexProof(x))

      expect(
        await ad
          .connect(owner)
          .preMint(11, presaleMaxes[0]!, hexProofsPreMint[0]!, {
            value: mintCost.mul(11),
          }),
        'You can buy more than PUBLIC_MAX_PER_TX in a preMint'
      ).to.be.ok

      expect(
        await bobs.preMint(20, presaleMaxes[1]!, hexProofsPreMint[1]!, {
          value: mintCost.mul(20),
        }),
        'You can buy a lot in preMint'
      ).to.be.ok

      expect(
        await ads.preMint(200, presaleMaxes[2]!, hexProofsPreMint[2]!, {
          value: mintCost.mul(200),
        }),
        'You can buy a lot more in preMint'
      ).to.be.ok
    })

    it('Testing of presaleMaxes updates', async () => {
      addresses = [owner.address, bob.address, alis.address]
      presaleMaxes = [5, 10, 15]
      leaves = createLeaves(addresses, presaleMaxes)
      let tree = new MerkleTree(leaves, keccak256, { sortPairs: true })
      rootTreePreMint = tree.getRoot()
      await ad.setMerkleRootPreMint(rootTreePreMint)

      hexProofsPreMint = leaves.map((x) => tree.getHexProof(x))

      expect(
        await ad
          .connect(owner)
          .preMint(5, presaleMaxes[0]!, hexProofsPreMint[0]!, {
            value: mintCost.mul(5),
          }),
        'You can buy nfts in a preMint 5'
      ).to.be.ok

      expect(
        await bobs.preMint(10, presaleMaxes[1]!, hexProofsPreMint[1]!, {
          value: mintCost.mul(10),
        }),
        'You can buy nfts in a preMint 10'
      ).to.be.ok

      expect(
        await ads.preMint(15, presaleMaxes[2]!, hexProofsPreMint[2]!, {
          value: mintCost.mul(15),
        }),
        'You can buy nfts in a preMint 15'
      ).to.be.ok

      presaleMaxes = [6, 15, 55]
      leaves = createLeaves(addresses, presaleMaxes)
      tree = new MerkleTree(leaves, keccak256, { sortPairs: true })
      rootTreePreMint = tree.getRoot()
      await ad.setMerkleRootPreMint(rootTreePreMint)
      hexProofsPreMint = leaves.map((x) => tree.getHexProof(x))

      await expect(
        ad.connect(owner).preMint(2, presaleMaxes[0]!, hexProofsPreMint[0]!, {
          value: mintCost.mul(2),
        }),
        'You can not buy nft for more than the additional amount. owner before'
      ).to.be.revertedWith('Already claimed max')
      expect(
        await ad
          .connect(owner)
          .preMint(1, presaleMaxes[0]!, hexProofsPreMint[0]!, {
            value: mintCost.mul(1),
          }),
        'You can buy nft for an additional 1'
      ).to.be.ok
      await expect(
        ad.connect(owner).preMint(1, presaleMaxes[0]!, hexProofsPreMint[0]!, {
          value: mintCost.mul(1),
        }),
        'You can not buy nft for more than the additional amount. owner after'
      ).to.be.revertedWith('Already claimed max')

      expect(
        await bobs.preMint(2, presaleMaxes[1]!, hexProofsPreMint[1]!, {
          value: mintCost.mul(2),
        }),
        'You can buy nft for an additional 2'
      ).to.be.ok
      expect(
        await bobs.preMint(3, presaleMaxes[1]!, hexProofsPreMint[1]!, {
          value: mintCost.mul(3),
        }),
        'You can buy nft for an additional 3'
      ).to.be.ok
      await expect(
        bobs.preMint(1, presaleMaxes[1]!, hexProofsPreMint[1]!, {
          value: mintCost.mul(1),
        }),
        'You can not buy nft for more than the additional amount. bob'
      ).to.be.revertedWith('Already claimed max')

      expect(
        await ads.preMint(40, presaleMaxes[2]!, hexProofsPreMint[2]!, {
          value: mintCost.mul(40),
        }),
        'You can buy a lot more additional in preMint 40'
      ).to.be.ok
      await expect(
        ads.preMint(1, presaleMaxes[2]!, hexProofsPreMint[2]!, {
          value: mintCost.mul(1),
        }),
        'You can not buy nft for more than the additional amount. alis 1'
      ).to.be.revertedWith('Already claimed max')
      await expect(
        ads.preMint(5, presaleMaxes[2]!, hexProofsPreMint[2]!, {
          value: mintCost.mul(5),
        }),
        'You can not buy nft for more than the additional amount. alis 5'
      ).to.be.revertedWith('Already claimed max')
      await expect(
        ads.preMint(100, presaleMaxes[2]!, hexProofsPreMint[2]!, {
          value: mintCost.mul(100),
        }),
        'You can not buy nft for more than the additional amount. alis 100'
      ).to.be.revertedWith('Already claimed max')
    })

    it('Pre Sale Price Boundary Check', async () => {
      const cost = ethers.utils.parseUnits(testConfig.price_pre.toString())
      expect(
        await ads.preMint(1, presaleMaxes[2]!, hexProofsPreMint[2]!, {
          value: cost,
        })
      ).to.ok
      expect(
        await ads.preMint(1, presaleMaxes[2]!, hexProofsPreMint[2]!, {
          value: cost.add(1),
        })
      ).to.ok
      await expect(
        ad.connect(alis).preMint(1, presaleMaxes[2]!, hexProofsPreMint[2]!, {
          value: cost.sub(1),
        })
      ).to.be.revertedWith('Not enough funds')
    })

    it('Pre Sale setPrice Check', async () => {
      const cost = ethers.utils.parseUnits('0.001')
      expect(await ad.setPreCost(cost))
      expect(
        await ads.preMint(1, presaleMaxes[2]!, hexProofsPreMint[2]!, {
          value: cost,
        })
      ).to.ok
      expect(
        await ads.preMint(1, presaleMaxes[2]!, hexProofsPreMint[2]!, {
          value: cost.add(1),
        })
      ).to.ok
      await expect(
        ads.preMint(1, presaleMaxes[2]!, hexProofsPreMint[2]!, {
          value: cost.sub(1),
        })
      ).to.be.revertedWith('Not enough funds')
    })

    it('Block over allocate Check', async () => {
      expect(
        await ads.preMint(5, presaleMaxes[2]!, hexProofsPreMint[2]!, {
          value: mintCost.mul(5),
        })
      ).to.be.ok
      expect(
        await ad
          .connect(alis)
          ['safeTransferFrom(address,address,uint256)'](
            alis.address,
            bob.address,
            1
          )
      ).to.be.ok
      expect(await ad.balanceOf(bob.address)).to.equal(1)
      expect(await ad.balanceOf(alis.address)).to.equal(4)
      await expect(
        ad.connect(alis).preMint(1, presaleMaxes[2]!, hexProofsPreMint[2]!, {
          value: mintCost,
        })
      ).to.be.revertedWith('Already claimed max')
    })
  })

  describe('PublicSaleWithoutProof checks', function () {
    let rootTreePreMint
    let addresses: string[]
    let leaves: Buffer[]
    let hexProofsPreMint: BytesLike[][]
    let presaleMaxes: number[]
    let mintCost: BigNumber

    beforeEach(async function () {
      mintCost = await ad.getCurrentCost()
      await ad.setMintable(true)
      await ad.setPresale(false)
    })

    it('Sale status check', async () => {
      addresses = [owner.address, bob.address, alis.address]

      expect(await ad.setPresale(true)).to.be.ok
      await expect(
        ad.connect(bob).publicMintWithoutProof(5, {
          value: mintCost.mul(5),
        })
      ).to.be.revertedWith('Presale is active.')

      expect(await ad.setPresale(false)).to.be.ok
      await expect(
        ad.connect(bob).publicMintWithoutProof(5, {
          value: mintCost.mul(5),
        })
      ).to.be.revertedWith('publicSaleWithoutProof is not open.')

      expect(await ad.setPublicSaleWithoutProof(true)).to.be.ok
      expect(
        ad.connect(bob).publicMintWithoutProof(5, {
          value: mintCost.mul(5),
        })
      ).not.to.be.reverted
    })

    it('Testing of publicMintWithoutProof', async () => {
      addresses = [owner.address, bob.address, alis.address]

      expect(await ad.connect(owner).setPublicSaleWithoutProof(true)).to.be.ok

      expect(
        await ad.connect(owner).publicMintWithoutProof(5, {
          value: mintCost.mul(5),
        }),
        'You can buy nfts in a publicMintWithoutProof 5'
      ).to.be.ok

      expect(await ad.connect(owner).setMaxPerWallet(5)).to.be.ok

      await expect(
        ad.connect(owner).publicMintWithoutProof(1, {
          value: mintCost.mul(1),
        })
      ).to.be.revertedWith('Already claimed max')

      expect(await ad.connect(owner).setMaxPerWallet(10)).to.be.ok

      expect(
        await ad.connect(owner).publicMintWithoutProof(5, {
          value: mintCost.mul(5),
        }),
        'You can buy nfts in a publicMintWithoutProof 5 again'
      ).to.be.ok

      await expect(
        ad.connect(owner).publicMintWithoutProof(1, {
          value: mintCost.mul(1),
        })
      ).to.be.revertedWith('Already claimed max')

      expect(
        await ad.connect(bob).publicMintWithoutProof(5, {
          value: mintCost.mul(5),
        }),
        'You can buy nfts in a publicMintWithoutProof 5'
      ).to.be.ok

      expect(
        await ad.connect(bob).publicMintWithoutProof(5, {
          value: mintCost.mul(5),
        }),
        'You can buy nfts in a publicMintWithoutProof 5 again'
      ).to.be.ok
    })
  })

  function createLeaves(
    _addresses: string[],
    _presaleMaxes: number[]
  ): Buffer[] {
    const leaves: Buffer[] = _addresses.map((address, i) => {
      // see https://ethereum.stackexchange.com/questions/127471/use-javascript-merkle-tree-to-generate-hex-proof-for-solidity-merkletree-validat
      const bufferAddress = Buffer.from(address.replace('0x', ''), 'hex')
      const bufferPresaleMax = Buffer.from(
        ethers.utils.defaultAbiCoder
          .encode(['uint256'], [_presaleMaxes[i]])
          .replace('0x', ''),
        'hex'
      )
      // console.log("bufferAddress : ", bufferAddress, ", bufferPresaleMax : ", bufferPresaleMax)
      // const leaf: Buffer = keccak256(address)
      // const leaf: Buffer = keccak256(address + _presaleMaxes[i])

      const leaf: Buffer = keccak256(
        Buffer.concat([bufferAddress, bufferPresaleMax])
      )
      // console.log("address : ", address, "_presaleMaxes[i] : ", _presaleMaxes[i], "leaf : ", leaf);

      return leaf
    })
    return leaves
  }
})
