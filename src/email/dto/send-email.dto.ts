export interface SendEmailDto {
  to: string;
  subject: string;
  html: string;
  fromName?: string;
}
