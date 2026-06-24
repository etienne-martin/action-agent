import sodium from 'libsodium-wrappers';
import { context } from '@actions/github';
import { getOctokit } from './octokit';
import { isNotFoundError } from './error';

export const CODEX_AUTH_SECRET_NAME = 'CODEX_AUTH_JSON';

export const encryptSecret = async (value: string, publicKey: string): Promise<string> => {
  await sodium.ready;

  return Buffer
    .from(sodium.crypto_box_seal(Buffer.from(value, 'utf8'), Buffer.from(publicKey, 'base64')))
    .toString('base64');
};

export const updateRepoSecret = async (name: string, value: string): Promise<void> => {
  const { owner, repo } = context.repo;
  const octokit = getOctokit();
  const { data } = await octokit.rest.actions.getRepoPublicKey({ owner, repo });

  await octokit.rest.actions.createOrUpdateRepoSecret({
    owner,
    repo,
    secret_name: name,
    encrypted_value: await encryptSecret(value, data.key),
    key_id: data.key_id,
  });
};

const getActionsSecretTarget = async (
  name: string,
): Promise<
  | { kind: 'repo'; name: string }
  | { kind: 'org'; name: string; visibility: 'all' | 'private' | 'selected' }
  | undefined
> => {
  const { owner, repo } = context.repo;
  const octokit = getOctokit();

  try {
    await octokit.rest.actions.getRepoSecret({ owner, repo, secret_name: name });
    return { kind: 'repo', name };
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }

  const orgSecrets = await octokit.paginate(octokit.rest.actions.listRepoOrganizationSecrets, {
    owner,
    repo,
    per_page: 100,
  });

  if (!orgSecrets.some((secret) => secret.name === name)) return undefined;

  const { data } = await octokit.rest.actions.getOrgSecret({ org: owner, secret_name: name });
  return { kind: 'org', name, visibility: data.visibility };
};

export const updateActionsSecret = async (
  name: string,
  value: string,
): Promise<void> => {
  const target = await getActionsSecretTarget(name);
  if (!target) throw new Error('no repository or organization secret exists');
  if (target.kind === 'repo') {
    await updateRepoSecret(target.name, value);
    return;
  }

  const { owner } = context.repo;
  const octokit = getOctokit();
  const { data } = await octokit.rest.actions.getOrgPublicKey({ org: owner });
  const encryptedValue = await encryptSecret(value, data.key);

  if (target.visibility === 'selected') {
    const repositories = await octokit.paginate(octokit.rest.actions.listSelectedReposForOrgSecret, {
      org: owner,
      secret_name: target.name,
      per_page: 100,
    });

    await octokit.rest.actions.createOrUpdateOrgSecret({
      org: owner,
      secret_name: target.name,
      encrypted_value: encryptedValue,
      key_id: data.key_id,
      visibility: target.visibility,
      selected_repository_ids: repositories.map((repository) => repository.id),
    });
    return;
  }

  await octokit.rest.actions.createOrUpdateOrgSecret({
    org: owner,
    secret_name: target.name,
    encrypted_value: encryptedValue,
    key_id: data.key_id,
    visibility: target.visibility,
  });
};
