interface EndpointDetailModalProps {
    endpoint: {
        method: string;
        path: string;
        file: string;
        line?: number;
        middleware?: string[];
        authentication?: boolean;
        description?: string;
    };
    onClose: () => void;
}
export declare function EndpointDetailModal({ endpoint, onClose, }: EndpointDetailModalProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=EndpointDetailModal.d.ts.map