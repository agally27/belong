import { listGatherings } from "@/lib/services/gatherings";

/** Gatherings a member can currently see. */
export const getGatherings = (userId: string) => listGatherings(userId);
