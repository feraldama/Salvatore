const erpApiUrl = process.env.EXPO_PUBLIC_ERP_API_URL;
const cmsApiUrl = process.env.EXPO_PUBLIC_CMS_API_URL;
const crmApiUrl = process.env.EXPO_PUBLIC_CRM_API_URL;

if (!erpApiUrl) {
  throw new Error('EXPO_PUBLIC_ERP_API_URL no esta definida en .env');
}

export const config = {
  erpApiUrl,
  cmsApiUrl: cmsApiUrl ?? '',
  crmApiUrl: crmApiUrl ?? '',
};
