import { BaseWalletSubprovider } from '@0x/subproviders/lib/src/subproviders/base_wallet_subprovider';
import { PartialTxParams } from '@0x/subproviders/lib/src/types';
import LWClient from 'ledger-web-client';
import LWHwTransport from 'ledger-web-hw-transport';
import { ethers } from 'ethers';
import Eth from '@ledgerhq/hw-app-eth';

class LedgerWebSubProvider extends BaseWalletSubprovider {
  app: Eth;

  client: LWClient;

  constructor(opts: { client: LWClient }) {
    super();
    this.client = opts.client;
    this.app = new Eth(new LWHwTransport(this.client));
  }

  // eslint-disable-next-line class-methods-use-this
  async signPersonalMessageAsync(): Promise<string> {
    throw new Error('not implemented yet, halp');
  }

  // eslint-disable-next-line class-methods-use-this
  async signTypedDataAsync(): Promise<string> {
    throw new Error('not implemented yet, halp');
  }

  async getAccountsAsync() {
    await this.client.request('devices', 'requireApp', [
      {
        name: 'Ethereum',
      },
    ]);
    let address;
    try {
      const res = await this.app.getAddress(`44'/60'/${0}'/0/0`, false, true);
      address = res.address;
    } catch (e) {
      throw new Error('getAddress error, is your device sleepy ?');
    }

    return [address];
  }

  async signTransactionAsync(txParams: PartialTxParams): Promise<string> {
    await this.client.request('devices', 'requireApp', [
      {
        name: 'Ethereum',
      },
    ]);
    await this.client.request('devices', 'requireDeviceActionStart', [{}]);

    const unsignedTx: ethers.utils.UnsignedTransaction = {
      to: txParams.to,
      data: txParams.data,
      chainId: 1,
    };

    if (txParams.nonce) {
      unsignedTx.nonce = parseInt(txParams.nonce, 16);
    }
    if (txParams.gas) {
      unsignedTx.gasLimit = ethers.BigNumber.from(txParams.gas);
    }
    if (txParams.gasPrice) {
      unsignedTx.gasPrice = ethers.BigNumber.from(txParams.gasPrice);
    }
    if (txParams.value) {
      unsignedTx.value = ethers.BigNumber.from(txParams.value);
    }

    const unsignedTxHex = ethers.utils.serializeTransaction(unsignedTx);

    try {
      await this.client.request('devices', 'requireApp', [
        {
          name: 'Ethereum',
        },
      ]);
    } catch (e) {
      throw new Error('app not accessible');
    }

    await this.client.request('devices', 'requireDeviceActionStart', [{}]);

    const path = `44'/60'/0'/0/0`;
    let result;
    try {
      result = await this.app.signTransaction(path, unsignedTxHex.slice(2));
    } catch (e) {
      await this.client.request('devices', 'requireDeviceActionEnd', [{}]);
      // TODO : when ledger-web-hw-transport relay correctly the error, display correct
      // message
      throw new Error('build tx error : did you reject or is your device sleeping ?');
    }

    await this.client.request('devices', 'requireDeviceActionEnd', [{}]);

    let { v } = result;
    if (unsignedTx.chainId > 0) {
      // EIP155 support. check/recalc signature v value.
      const rv = parseInt(v, 16);
      let cv = unsignedTx.chainId * 2 + 35;
      // eslint-disable-next-line no-bitwise
      if (rv !== cv && (rv & cv) !== rv) {
        cv += 1; // add signature v bit.
      }
      v = cv.toString(16);
    }

    const signature = {
      r: `0x${result.r}`,
      s: `0x${result.s}`,
      v: parseInt(v, 16),
    };

    const signedTxHex = ethers.utils.serializeTransaction(unsignedTx, signature);

    return signedTxHex;
  }
}

export default LedgerWebSubProvider;
