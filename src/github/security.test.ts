const contextMock = {
  actor: 'octo',
  repo: { owner: 'octo', repo: 'sudden-agent' }
};

jest.mock('@actions/github', () => ({ context: contextMock }));

jest.mock('./permissions', () => ({
  fetchPermission: jest.fn(),
}));

jest.mock('./octokit', () => ({
  getOctokit: jest.fn(),
}));

import { ensureWriteAccess, fetchTrustedCollaborators } from './security';
import { fetchPermission } from './permissions';
import { getOctokit } from './octokit';

const fetchPermissionMock = jest.mocked(fetchPermission);
const getOctokitMock = jest.mocked(getOctokit);

describe('ensureWriteAccess', () => {
  afterEach(() => {
    fetchPermissionMock.mockReset();
    contextMock.actor = 'octo';
  });

  it('skips permission checks for bot actors', async () => {
    contextMock.actor = 'sudden-agent[bot]';

    await expect(ensureWriteAccess()).resolves.toBeUndefined();
    expect(fetchPermissionMock).not.toHaveBeenCalled();
  });

  it('allows write access', async () => {
    fetchPermissionMock.mockResolvedValue('write');

    await expect(ensureWriteAccess()).resolves.toBeUndefined();
  });

  it('rejects non-write access', async () => {
    fetchPermissionMock.mockResolvedValue('read');

    await expect(ensureWriteAccess()).rejects.toThrow('must have write access');
  });
});

describe('fetchTrustedCollaborators', () => {
  afterEach(() => {
    getOctokitMock.mockReset();
  });

  it('returns collaborators with role names', async () => {
    const listCollaboratorsMock = jest.fn();
    const paginateMock = jest.fn().mockResolvedValue([
      { login: 'octo', role_name: 'admin' },
      { login: 'hubot', role_name: 'read' },
    ]);

    getOctokitMock.mockReturnValue({
      rest: { repos: { listCollaborators: listCollaboratorsMock } },
      paginate: paginateMock,
    } as unknown as ReturnType<typeof getOctokit>);

    const result = await fetchTrustedCollaborators();

    expect(paginateMock).toHaveBeenCalledWith(
      listCollaboratorsMock,
      { owner: 'octo', repo: 'sudden-agent', permission: 'push', per_page: 100 },
    );
    expect(result).toEqual([
      { login: 'octo', roleName: 'admin' },
      { login: 'hubot', roleName: 'read' },
    ]);
  });
});
