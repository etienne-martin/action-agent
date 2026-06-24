const contextMock = {
  repo: {
    owner: 'octo',
    repo: 'agent',
  },
};

const getRepoPublicKeyMock = jest.fn().mockResolvedValue({
  data: {
    key: Buffer.from('public-key').toString('base64'),
    key_id: 'key-id',
  },
});
const getOrgPublicKeyMock = jest.fn().mockResolvedValue({
  data: {
    key: Buffer.from('org-public-key').toString('base64'),
    key_id: 'org-key-id',
  },
});
const getRepoSecretMock = jest.fn().mockResolvedValue({ data: { name: 'CODEX_AUTH_JSON' } });
const listRepoOrganizationSecretsMock = jest.fn().mockResolvedValue({
  data: {
    secrets: [],
  },
});
const getOrgSecretMock = jest.fn().mockResolvedValue({
  data: {
    name: 'CODEX_AUTH_JSON',
    visibility: 'private',
  },
});
const listSelectedReposForOrgSecretMock = jest.fn().mockResolvedValue({
  data: {
    repositories: [],
  },
});
const createOrUpdateRepoSecretMock = jest.fn().mockResolvedValue(undefined);
const createOrUpdateOrgSecretMock = jest.fn().mockResolvedValue(undefined);
const paginateMock = jest.fn((endpoint, params) => endpoint(params).then(({ data }: {
  data: { repositories?: { id: number }[]; secrets?: { name: string }[] };
}) => data.repositories ?? data.secrets ?? []));

jest.mock('@actions/github', () => ({ context: contextMock }));

jest.mock('./octokit', () => ({
  getOctokit: () => ({
    paginate: paginateMock,
    rest: {
      actions: {
        getRepoPublicKey: getRepoPublicKeyMock,
        getOrgPublicKey: getOrgPublicKeyMock,
        getRepoSecret: getRepoSecretMock,
        getOrgSecret: getOrgSecretMock,
        listRepoOrganizationSecrets: listRepoOrganizationSecretsMock,
        listSelectedReposForOrgSecret: listSelectedReposForOrgSecretMock,
        createOrUpdateRepoSecret: createOrUpdateRepoSecretMock,
        createOrUpdateOrgSecret: createOrUpdateOrgSecretMock,
      },
    },
  }),
}));

jest.mock('libsodium-wrappers', () => ({
  __esModule: true,
  default: {
    ready: Promise.resolve(),
    crypto_box_seal: jest.fn().mockReturnValue(Uint8Array.from([1, 2, 3])),
  },
}));

import sodium from 'libsodium-wrappers';
import { encryptSecret, updateActionsSecret, updateRepoSecret } from './secrets';

const cryptoBoxSealMock = jest.mocked(sodium.crypto_box_seal);

describe('github secrets', () => {
  afterEach(() => {
    cryptoBoxSealMock.mockClear();
    getRepoPublicKeyMock.mockClear();
    getOrgPublicKeyMock.mockClear();
    getRepoSecretMock.mockClear();
    getRepoSecretMock.mockResolvedValue({ data: { name: 'CODEX_AUTH_JSON' } });
    listRepoOrganizationSecretsMock.mockClear();
    listRepoOrganizationSecretsMock.mockResolvedValue({ data: { secrets: [] } });
    getOrgSecretMock.mockClear();
    getOrgSecretMock.mockResolvedValue({
      data: {
        name: 'CODEX_AUTH_JSON',
        visibility: 'private',
      },
    });
    listSelectedReposForOrgSecretMock.mockClear();
    listSelectedReposForOrgSecretMock.mockResolvedValue({ data: { repositories: [] } });
    createOrUpdateRepoSecretMock.mockClear();
    createOrUpdateOrgSecretMock.mockClear();
    paginateMock.mockClear();
  });

  describe('encryptSecret', () => {
    it('encrypts with the repo public key', async () => {
      const encrypted = await encryptSecret('secret-value', Buffer.from('public-key').toString('base64'));

      expect(encrypted).toBe(Buffer.from([1, 2, 3]).toString('base64'));
      expect(Buffer.from(cryptoBoxSealMock.mock.calls[0][0]).toString('utf8')).toBe('secret-value');
      expect(Buffer.from(cryptoBoxSealMock.mock.calls[0][1]).toString('utf8')).toBe('public-key');
    });
  });

  describe('updateRepoSecret', () => {
    it('updates a repo secret with encrypted value', async () => {
      await updateRepoSecret('CODEX_AUTH_JSON', 'secret-value');

      expect(getRepoPublicKeyMock).toHaveBeenCalledWith({
        owner: 'octo',
        repo: 'agent',
      });
      expect(createOrUpdateRepoSecretMock).toHaveBeenCalledWith({
        owner: 'octo',
        repo: 'agent',
        secret_name: 'CODEX_AUTH_JSON',
        encrypted_value: Buffer.from([1, 2, 3]).toString('base64'),
        key_id: 'key-id',
      });
    });
  });

  describe('updateActionsSecret', () => {
    it('updates an existing repo secret', async () => {
      await updateActionsSecret('CODEX_AUTH_JSON', 'secret-value');

      expect(getRepoSecretMock).toHaveBeenCalledWith({
        owner: 'octo',
        repo: 'agent',
        secret_name: 'CODEX_AUTH_JSON',
      });
      expect(createOrUpdateRepoSecretMock).toHaveBeenCalledWith({
        owner: 'octo',
        repo: 'agent',
        secret_name: 'CODEX_AUTH_JSON',
        encrypted_value: Buffer.from([1, 2, 3]).toString('base64'),
        key_id: 'key-id',
      });
      expect(createOrUpdateOrgSecretMock).not.toHaveBeenCalled();
    });

    it('updates an org secret shared with the repo', async () => {
      getRepoSecretMock.mockRejectedValue({ status: 404 });
      listRepoOrganizationSecretsMock.mockResolvedValue({
        data: {
          secrets: [{ name: 'CODEX_AUTH_JSON' }],
        },
      });

      await updateActionsSecret('CODEX_AUTH_JSON', 'secret-value');

      expect(createOrUpdateRepoSecretMock).not.toHaveBeenCalled();
      expect(getOrgSecretMock).toHaveBeenCalledWith({
        org: 'octo',
        secret_name: 'CODEX_AUTH_JSON',
      });
      expect(createOrUpdateOrgSecretMock).toHaveBeenCalledWith({
        org: 'octo',
        secret_name: 'CODEX_AUTH_JSON',
        encrypted_value: Buffer.from([1, 2, 3]).toString('base64'),
        key_id: 'org-key-id',
        visibility: 'private',
      });
    });

    it('preserves selected repositories for selected org secrets', async () => {
      getRepoSecretMock.mockRejectedValue({ status: 404 });
      listRepoOrganizationSecretsMock.mockResolvedValue({
        data: {
          secrets: [{ name: 'CODEX_AUTH_JSON' }],
        },
      });
      getOrgSecretMock.mockResolvedValue({
        data: {
          name: 'CODEX_AUTH_JSON',
          visibility: 'selected',
        },
      });
      listSelectedReposForOrgSecretMock.mockResolvedValue({
        data: {
          repositories: [{ id: 123 }, { id: 456 }],
        },
      });

      await updateActionsSecret('CODEX_AUTH_JSON', 'secret-value');

      expect(createOrUpdateOrgSecretMock).toHaveBeenCalledWith({
        org: 'octo',
        secret_name: 'CODEX_AUTH_JSON',
        encrypted_value: Buffer.from([1, 2, 3]).toString('base64'),
        key_id: 'org-key-id',
        visibility: 'selected',
        selected_repository_ids: [123, 456],
      });
    });

    it('skips missing repo and org secrets', async () => {
      getRepoSecretMock.mockRejectedValue({ status: 404 });

      await expect(updateActionsSecret('CODEX_AUTH_JSON', 'secret-value')).resolves.toBeUndefined();

      expect(createOrUpdateRepoSecretMock).not.toHaveBeenCalled();
      expect(createOrUpdateOrgSecretMock).not.toHaveBeenCalled();
    });
  });
});
