import {cloudRequest} from '../cloud.js';
import {createOrderStore} from '../orders-store.js';
export const orderStore=createOrderStore(cloudRequest);
