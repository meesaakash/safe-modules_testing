import { expect } from 'chai'
import { deployments, ethers, waffle } from 'hardhat'
import '@nomiclabs/hardhat-ethers'
import { getSimple4337Module, getEntryPoint, getFactory, getAddModulesLib, getSafeL2Singleton } from '../utils/setup'
import { buildSignatureBytes, logGas } from '../../src/utils/execution'
import {
  buildUserOperationFromSafeUserOperation,
  buildSafeUserOpTransaction,
  signSafeOp,
} from '../../src/utils/userOp'
import { chainId } from '../utils/encoding'
import { Safe4337 } from '../../src/utils/safe'

describe('EIP4337Module - Newly deployed safe', async () => {
  const [user1] = waffle.provider.getWallets()

  const setupTests = deployments.createFixture(async ({ deployments }) => {
    await deployments.fixture()
    
    const entryPoint = await getEntryPoint()
    const module = await getSimple4337Module()
    const proxyFactory = await getFactory()
    const proxyCreationCode = await proxyFactory.proxyCreationCode()
    const addModulesLib = await getAddModulesLib()
    const singleton = await getSafeL2Singleton()
    const safe = await Safe4337.withSigner(user1.address, {
      safeSingleton: singleton.address,
      entryPoint: entryPoint.address,
      erc4337module: module.address,
      proxyFactory: proxyFactory.address,
      addModulesLib: addModulesLib.address,
      proxyCreationCode,
      chainId: await chainId()
    })

    return {
      safe,
      proxyFactory,
      addModulesLib,
      validator: module,
      entryPoint
    }
  })

  describe('execTransaction - new account', () => {

    it('should revert with invalid signature', async () => {
      const { safe, entryPoint } = await setupTests()

      await user1.sendTransaction({to: safe.address, value: ethers.utils.parseEther("1.0")})
      expect(await ethers.provider.getBalance(safe.address)).to.be.eq(ethers.utils.parseEther("1.0"))
      const safeOp = buildSafeUserOpTransaction(safe.address, user1.address, ethers.utils.parseEther("0.5"), "0x", '0', entryPoint.address)
      const signature = buildSignatureBytes([await signSafeOp(user1, user1.address, safeOp, await chainId())])
      const userOp = buildUserOperationFromSafeUserOperation({
        safeAddress: safe.address, 
        safeOp, 
        signature,
        initCode: safe.getInitCode()
      })
      await expect(entryPoint.executeUserOp(userOp, 0)).to.be.revertedWith("Signature validation failed")
      expect(await ethers.provider.getBalance(safe.address)).to.be.eq(ethers.utils.parseEther("1.0"))
    })

    it('should execute contract calls without fee', async () => {
      const { safe, validator, entryPoint } = await setupTests()

      await user1.sendTransaction({to: safe.address, value: ethers.utils.parseEther("1.0")})
      expect(await ethers.provider.getBalance(safe.address)).to.be.eq(ethers.utils.parseEther("1.0"))
      const safeOp = buildSafeUserOpTransaction(safe.address, user1.address, ethers.utils.parseEther("0.5"), "0x", '0', entryPoint.address)
      const signature = buildSignatureBytes([await signSafeOp(user1, validator.address, safeOp, await chainId())])
      const userOp = buildUserOperationFromSafeUserOperation({
        safeAddress: safe.address, 
        safeOp, 
        signature,
        initCode: safe.getInitCode()
      })
      await logGas(
        "Execute UserOp without fee payment",
        entryPoint.executeUserOp(userOp, 0)
      )
      expect(await ethers.provider.getBalance(safe.address)).to.be.eq(ethers.utils.parseEther("0.5"))
    })

    it('should not be able to execute contract calls twice', async () => {
      const { safe, validator, entryPoint } = await setupTests()

      await user1.sendTransaction({to: safe.address, value: ethers.utils.parseEther("1.0")})
      expect(await ethers.provider.getBalance(safe.address)).to.be.eq(ethers.utils.parseEther("1.0"))
      const safeOp = buildSafeUserOpTransaction(safe.address, user1.address, ethers.utils.parseEther("0.5"), "0x", '0', entryPoint.address)
      const signature = buildSignatureBytes([await signSafeOp(user1, validator.address, safeOp, await chainId())])
      const userOp = buildUserOperationFromSafeUserOperation({
        safeAddress: safe.address, 
        safeOp, 
        signature,
        initCode: safe.getInitCode()
      })
      await logGas(
        "Execute UserOp without fee payment",
        entryPoint.executeUserOp(userOp, 0)
      )
      expect(await ethers.provider.getBalance(safe.address)).to.be.eq(ethers.utils.parseEther("0.5"))
      await expect(entryPoint.executeUserOp(userOp, 0)).to.be.revertedWith("InvalidNonce(0)")
    })

    it('should execute contract calls with fee', async () => {
      const { safe, validator, entryPoint } = await setupTests()

      await user1.sendTransaction({to: safe.address, value: ethers.utils.parseEther("1.0")})
      expect(await ethers.provider.getBalance(safe.address)).to.be.eq(ethers.utils.parseEther("1.0"))
      const safeOp = buildSafeUserOpTransaction(safe.address, user1.address, ethers.utils.parseEther("0.5"), "0x", '0', entryPoint.address)
      const signature = buildSignatureBytes([await signSafeOp(user1, validator.address, safeOp, await chainId())])
      const userOp = buildUserOperationFromSafeUserOperation({
        safeAddress: safe.address, 
        safeOp, 
        signature,
        initCode: safe.getInitCode()
      })
      await logGas(
        "Execute UserOp with fee payment",
        entryPoint.executeUserOp(userOp, ethers.utils.parseEther("0.000001"))
      )
      expect(await ethers.provider.getBalance(safe.address)).to.be.eq(ethers.utils.parseEther("0.499999"))
    })
  })
})
