import {next} from '@vercel/functions';
import {protectPage} from './server/page-auth.js';
export default function proxy(request){return protectPage(request,{proceed:next});}
