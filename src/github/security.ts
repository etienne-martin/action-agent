import { context } from '@actions/github';
import { fetchPermission } from './permissions';
import { getOctokit } from './octokit';

export type TrustedCollaborator = {
  login: string;
  roleName: string;
};

export const ensureWriteAccess = async (): Promise<void> => {
  const { actor, repo: { owner, repo } } = context;

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
        permission: "push",
        per_page: 100,
      },
    );

    return collaborators.map((collaborator) => ({
      login: collaborator.login,
      roleName: collaborator.role_name,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to list trusted collaborators for ${owner}/${repo}: ${message}`);
  }
};
