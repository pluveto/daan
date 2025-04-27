import { MarketplaceView } from '@/components/Marketplace/MarketplaceView';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';

export function MarketPlaceTab() {
  return (
    <Tabs defaultValue="market-miniapp" className="flex h-full flex-col">
      <TabsList>
        <TabsTrigger value="market-miniapp">Miniapps</TabsTrigger>
        <TabsTrigger value="market-char">Characters</TabsTrigger>
      </TabsList>
      <TabsContent value="market-miniapp" className="flex-grow overflow-hidden">
        <MarketplaceView type="miniapp" />
      </TabsContent>
      <TabsContent value="market-char" className="flex-grow overflow-hidden">
        <MarketplaceView type="character" />
      </TabsContent>
    </Tabs>
  );
}
