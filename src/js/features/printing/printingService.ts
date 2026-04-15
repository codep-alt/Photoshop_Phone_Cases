import { evalTS } from "../../lib/utils/bolt";
import { Order } from "../../../shared/shared";

export const generateBatch = (orders: Order[]): Promise<void> => {
  return evalTS("generateBatch", orders);
};

export const printAllDocuments = (closeAfter: boolean): Promise<void> => {
  return evalTS("printAllDocuments", closeAfter);
};
