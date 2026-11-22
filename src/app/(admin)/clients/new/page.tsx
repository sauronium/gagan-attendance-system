import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { NewClientForm } from "@/components/clients/client-forms";
import { PageHeader } from "@/components/app/page-header";
import { buttonVariants } from "@/components/ui/button";
import { requireAdmin } from "@/lib/session";
import { employeeOptions } from "@/server/lookups";

export const metadata: Metadata = { title: "New client" };

export default async function NewClientPage() {
  await requireAdmin();
  const owners = await employeeOptions();
  return (
    <>
      <PageHeader
        title="New client"
        description="Add the client with their main contact and first site. Plants and contracts are added on the client page."
        actions={
          <Link href="/clients" className={buttonVariants({ variant: "ghost" })}>
            <ArrowLeftIcon /> Clients
          </Link>
        }
      />
      <div className="w-full max-w-3xl">
        <NewClientForm owners={owners} />
      </div>
    </>
  );
}
