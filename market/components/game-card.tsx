import Link from "next/link";
import { Play } from "lucide-react";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/shadcn/card";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { cx } from "@/components/ui";
import { gameThumb, type Game } from "@/lib/games";

export function GameCard({ g }: { g: Game }) {
  return (
    <Card className="glow gap-0 overflow-hidden rounded-2xl bg-panel py-0">
      <div className="relative">
        <img src={gameThumb(g)} alt="" className={cx("aspect-[274/166] w-full object-cover", g.soon && "opacity-60 grayscale-[60%]")} />
        {g.soon && <Badge variant="outline" className="absolute right-3 top-3 border-white/10 bg-black/70 font-bold text-neutral-200">Coming Soon</Badge>}
      </div>
      <CardContent className="flex flex-1 flex-col p-4">
        <CardTitle className="text-lg">{g.name}</CardTitle>
        <CardDescription className="mt-1 flex-1 text-xs font-semibold text-muted">{g.desc}</CardDescription>
        <p className="my-3 flex flex-wrap gap-1">
          {g.tags.map((t) => <Badge key={t} variant="outline" className="border-white/10 text-[10px] font-bold text-muted">{t}</Badge>)}
        </p>
        {g.soon
          ? <Button disabled variant="outline" className="h-9 rounded-full border-white/10 bg-transparent text-sm font-bold">Coming Soon</Button>
          : <Button asChild variant="outline" className="h-9 rounded-full border-indigo-500 bg-transparent text-sm font-bold text-indigo-400 hover:bg-indigo-600 hover:text-white dark:border-indigo-500 dark:bg-transparent dark:hover:bg-indigo-600"><Link href={`/play/${g.slug}`}><Play className="fill-current" /> Play Now</Link></Button>}
      </CardContent>
    </Card>
  );
}
