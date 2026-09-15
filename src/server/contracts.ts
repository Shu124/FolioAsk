export interface Account {
  id: string;
  email: string;
  name?: string;
  providers?: string[];
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
  googleUrl?(redirect: string, challenge: string): Promise<string>;
  exchangeGoogle?(code: string, verifier: string): Promise<Account>;
  account?(id: string): Promise<Account>;
  updateName?(id: string, name: string): Promise<void>;
  changePassword?(
    account: Account,
    currentPassword: string,
    password: string,
  ): Promise<void>;
}
export interface Store {
  putSession(session: Session): Promise<void>;
  getSession(hash: string): Promise<Session | undefined>;
  deleteSession(hash: string): Promise<void>;
  deleteAccountSessions(ownerId: string): Promise<void>;
  listWorkspaces(ownerId: string): Promise<Workspace[]>;
  getWorkspace(id: string, ownerId: string): Promise<Workspace | undefined>;
  putWorkspace(workspace: Workspace): Promise<void>;
}
