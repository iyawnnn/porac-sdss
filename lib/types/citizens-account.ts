export interface SecurityStatus {
  hasPassword: boolean;
  providers: { google: boolean; facebook: boolean };
}
