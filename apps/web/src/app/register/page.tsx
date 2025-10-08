import RegisterClient from './RegisterClient';

export default function Page({ searchParams }: { searchParams?: { boxId?: string; step?: string } }) {
  const boxId = searchParams?.boxId;
  const step = Number.isFinite(Number(searchParams?.step)) ? Number(searchParams!.step) : 0;
  return <RegisterClient initialBoxId={boxId} initialStep={step} />;
}
