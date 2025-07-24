import type { Organization } from "./Organization";
import type { User } from "./User";
export type LoginResponse = {
    token?: string;
    user?: User;
    organizations?: Array<Organization>;
};
//# sourceMappingURL=LoginResponse.d.ts.map