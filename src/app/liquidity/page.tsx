import { LiquidityCard } from "@/components/LiquidityCard";
import { LiquidityList } from "@/components/LiquidityList";

export default function LiquidityPage() {
  return (
    <div className="flex w-full flex-col items-center gap-5">
      <LiquidityCard />
      <LiquidityList />
    </div>
  );
}
