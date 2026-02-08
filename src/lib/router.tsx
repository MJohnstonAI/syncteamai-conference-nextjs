"use client";

import LinkBase from "next/link";
import { usePathname, useRouter, useSearchParams as useNextSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, useEffect, type ComponentProps } from "react";

type NavigateOptions = {
  replace?: boolean;
  scroll?: boolean;
};

type SetSearchParamsOptions = NavigateOptions;

type SearchParamsInput =
  | string
  | URLSearchParams
  | Record<string, string | number | boolean | null | undefined>
  | Array<[string, string]>;

export const useNavigate = () => {
  const router = useRouter();

  return useCallback(
    (to: string, options?: NavigateOptions) => {
      if (options?.replace) {
        router.replace(to, { scroll: options.scroll });
        return;
      }

      router.push(to, { scroll: options?.scroll });
    },
    [router]
  );
};

export const useLocation = () => {
  const pathname = usePathname();
  const searchParams = useNextSearchParams();
  const [hash, setHash] = useState("");

  useEffect(() => {
    const syncHash = () => setHash(window.location.hash || "");
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  const search = searchParams.toString();

  return useMemo(
    () => ({
      pathname,
      search: search ? `?${search}` : "",
      hash,
    }),
    [hash, pathname, search]
  );
};

const toURLSearchParams = (value: SearchParamsInput) => {
  if (typeof value === "string") {
    return new URLSearchParams(value);
  }

  if (value instanceof URLSearchParams) {
    return new URLSearchParams(value);
  }

  if (Array.isArray(value)) {
    return new URLSearchParams(value);
  }

  const params = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(value)) {
    if (rawValue === null || rawValue === undefined) continue;
    params.set(key, String(rawValue));
  }
  return params;
};

export const useSearchParams = () => {
  const router = useRouter();
  const pathname = usePathname();
  const nextSearchParams = useNextSearchParams();

  const stableParams = useMemo(
    () => new URLSearchParams(nextSearchParams.toString()),
    [nextSearchParams]
  );

  const setSearchParams = useCallback(
    (nextValue: SearchParamsInput, options?: SetSearchParamsOptions) => {
      const params = toURLSearchParams(nextValue);
      const query = params.toString();
      const target = query ? `${pathname}?${query}` : pathname;

      if (options?.replace) {
        router.replace(target, { scroll: options.scroll });
        return;
      }

      router.push(target, { scroll: options?.scroll });
    },
    [pathname, router]
  );

  return [stableParams, setSearchParams] as const;
};

type LinkProps = Omit<ComponentProps<typeof LinkBase>, "href"> & {
  to: ComponentProps<typeof LinkBase>["href"];
};

export const Link = ({ to, ...props }: LinkProps) => {
  return <LinkBase href={to} {...props} />;
};
