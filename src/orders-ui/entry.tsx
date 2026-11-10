import React from 'react';
import {createRoot} from 'react-dom/client';
import {currentUser,syncAuthShell} from '../cloud.js';
import Page from './page';
const root=document.getElementById('orders-root');
if(root&&syncAuthShell()&&currentUser())createRoot(root).render(<Page/>);
else if(root)root.textContent='请先登录后使用订单管理。';
