interface EmailOptions {
    to: string;
    subject: string;
    html: string;
    text?: string;
    from?: string;
}
export declare function sendEmail(options: EmailOptions): Promise<void>;
export {};
//# sourceMappingURL=email.service.d.ts.map