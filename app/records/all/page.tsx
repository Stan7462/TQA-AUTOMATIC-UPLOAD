import RecordsPage from "../records-page";
export const dynamic = "force-dynamic";
export default async function Page() { return await RecordsPage({ view: "all" }); }
