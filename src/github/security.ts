import { context } from '@actions/github';
import { fetchPermission } from './permissions';
import { getOctokit } from './octokit';
import { isPrivateRepo } from './context';

export type TrustedCollaborator = {
  login: string;
  roleName: string;
};

export const ensureWriteAccess = async (): Promise<void> => {
  const { actor, repo: { owner, repo } } = context;

  if (isPrivateRepo()) return;
  if (actor.endsWith('[bot]')) return;

  const permission = await fetchPermission();

  if (!(["admin", "write", "maintain"].includes(permission))) {
    throw new Error(`Actor '${actor}' must have write access to ${owner}/${repo}. Detected permission: '${permission}'.`);
  }
};

export const fetchTrustedCollaborators = async (): Promise<TrustedCollaborator[]> => {
  const { repo: { owner, repo } } = context;
  const octokit = getOctokit();

  try {
    const collaborators = await octokit.paginate(
      octokit.rest.repos.listCollaborators,
      {
        owner,
        repo,
        per_page: 100,
      },
    );

    const collaboratorsByLogin = new Map<string, string>();

    for (const collaborator of collaborators) {
      collaboratorsByLogin.set(collaborator.login, collaborator.role_name);
    }

    return [...collaboratorsByLogin.entries()].map(([login, roleName]) => ({ login, roleName }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to list trusted collaborators for ${owner}/${repo}: ${message}`);
  }
};
