import {defineConfig} from 'vite';
import {paymentsPlugin} from './api.ts';
export default defineConfig({plugins:[paymentsPlugin()],server:{host:'127.0.0.1',port:4322,strictPort:true,fs:{strict:true}},preview:{host:'127.0.0.1',port:4322,strictPort:true},build:{outDir:'dist-paypal',rollupOptions:{input:'payments.html'}}});
