import AdminModulePage from "../[module]/page";

export const metadata = { title: "Video + Premium" };

// Keep the critical video console as an explicit route. The shared module page
// still owns the data and UI, while this route prevents platform routing or
// static-generation changes from ever turning /admin/video into a 404.
export default function VideoAdminPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    q?: string;
    tool?: string;
    event?: string;
    page?: string;
    gender?: string;
    status?: string;
    player?: string;
    person?: string;
  }>;
}) {
  return (
    <AdminModulePage
      params={Promise.resolve({ module: "video" })}
      searchParams={searchParams}
    />
  );
}
