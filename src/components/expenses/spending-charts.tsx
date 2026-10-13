"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import type { CategorySpend, MonthlySpend } from "@/lib/expenses/analytics";
import { formatMoney } from "@/lib/money";

function monthLabel(month: unknown): string {
  const [year, monthIndex] = String(month).split("-").map(Number);
  if (!year || !monthIndex) {
    return String(month);
  }
  return new Date(year, monthIndex - 1, 1).toLocaleDateString("en-NZ", {
    month: "short",
    year: "2-digit",
  });
}

/**
 * Spending breakdown: a donut by category and a bar of monthly totals. Both
 * derive from the same immutable expense rows, so they always agree with the
 * ledger and the balances.
 */
export function SpendingCharts({
  byCategory,
  byMonth,
  currency,
}: {
  byCategory: CategorySpend[];
  byMonth: MonthlySpend[];
  currency: string;
}) {
  const hasCategory = byCategory.length > 0;
  const hasMonth = byMonth.length > 0;
  if (!hasCategory && !hasMonth) {
    return null;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader title="By category" />
        {hasCategory ? (
          <div className="h-64 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={byCategory}
                  dataKey="totalCents"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  strokeWidth={1}
                >
                  {byCategory.map((entry) => (
                    <Cell key={entry.name} fill={entry.colorHex} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatMoney(Number(value), currency)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState
            title="No spending yet"
            body="Categories appear here once expenses are added."
          />
        )}
      </Card>

      <Card>
        <CardHeader title="Spending over time" />
        {hasMonth ? (
          <div className="h-64 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byMonth} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="month"
                  tickFormatter={monthLabel}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => formatMoney(Number(value), currency)}
                  width={70}
                />
                <Tooltip
                  formatter={(value) => formatMoney(Number(value), currency)}
                  labelFormatter={monthLabel}
                />
                <Bar dataKey="totalCents" fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState
            title="No spending yet"
            body="The monthly trend appears here as expenses accumulate."
          />
        )}
      </Card>
    </div>
  );
}
