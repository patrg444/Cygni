export interface EmailTemplate {
    subject: string;
    html: (data: any) => string;
    text?: (data: any) => string;
}
export declare const dripCampaignTemplates: Record<string, EmailTemplate>;
//# sourceMappingURL=drip-campaign.d.ts.map