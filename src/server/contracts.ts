export interface Account {
  id: string;
  email: string;
}
export interface Workspace {
  id: string;
  ownerId: string;
  name: string;
  createdAt: number;
}
export interface Session {
  hash: string;
  account: Account;
  expiresAt: number;
}
export interface IdentityProvider {
  signIn(email: string, password: string): Promise<Account>;
  signUp(email: string, password: string): Promise<void>;
}
export interface Store {
  putSession(session: Session): Promise<void>;
  getSession(hash: string): Promise<Session | undefined>;
  deleteSession(hash: string): Promise<void>;
  listWorkspaces(ownerId: string): Promise<Workspace[]>;
  getWorkspace(id: string, ownerId: string): Promise<Workspace | undefined>;
  putWorkspace(workspace: Workspace): Promise<void>;
}
