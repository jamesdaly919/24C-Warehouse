import { notFound } from 'next/navigation';
import { getCompany, COMPANY_LIST } from '@/lib/companies';
import CompanyApp from '@/components/CompanyApp';

export function generateStaticParams() {
  return COMPANY_LIST.map((c) => ({ company: c.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ company: string }> }) {
  const company = getCompany((await params).company);
  return { title: company ? `${company.name} · Warehousing` : 'Warehousing' };
}

export default async function CompanyPage({ params }: { params: Promise<{ company: string }> }) {
  const company = getCompany((await params).company);
  if (!company) notFound();
  return <CompanyApp company={company} />;
}
