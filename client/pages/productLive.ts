import { defineModule } from '../core/registry';
import { $, currentUser } from '../core/motion';
import { productEnter } from '../animations/product';
import { onEvent, onResync } from '../realtime/sse';
import { toast } from '../ui/toast';

/**
 * Product detail page. Stock changes made by anyone (here or elsewhere) arrive over SSE and the
 * stock panel is refreshed from the server; the swap hooks in main.ts animate the number, the
 * status transition and any low-stock warning.
 */
defineModule('productLive', (root) => {
  const productId = root.dataset.productId;
  if (!productId) return;
  productEnter(root);
  const me = currentUser();

  const refresh = () => {
    const panel = document.getElementById('stock-panel');
    if (panel) void htmx.ajax('GET', `/products/${productId}/stock`, { target: panel, swap: 'outerHTML' });
  };

  const off = onEvent((e) => {
    if (e.productId !== productId) return;
    if (e.type === 'inventory.changed') {
      const panel = $('#stock-panel');
      if (panel && Number(panel.dataset.quantity) === e.newQuantity) return; // our own change, already shown
      refresh();
      if (e.actorId !== me)
        toast({
          type: 'info',
          title: e.name ?? 'Stock updated',
          message: `Stock changed ${e.previousQuantity} → ${e.newQuantity}.`,
        });
    } else if (e.type === 'product.updated' && e.actorId !== me) {
      toast({ type: 'info', message: 'This product was updated. Reload to see the latest details.' });
    }
  });
  const offResync = onResync(refresh);
  return () => {
    off();
    offResync();
  };
});
