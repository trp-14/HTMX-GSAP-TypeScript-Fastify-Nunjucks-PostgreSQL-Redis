import { defineModule } from '../core/registry';
import { currentUser } from '../core/motion';
import { onEvent, onResync } from '../realtime/sse';
import { toast } from '../ui/toast';

/**
 * Request detail page. When someone else moves this request through the workflow (or assigns
 * it), the workflow panel is re-fetched as a server-rendered fragment — the out-of-band parts
 * update the status badge and history too. Our own actions already swapped the panel, so events
 * whose target status is already displayed are ignored.
 */
defineModule('requestLive', (root) => {
  const requestId = root.dataset.requestId;
  const number = root.dataset.requestNumber;
  const me = currentUser();
  if (!requestId || !number) return;

  const refresh = () => {
    const panel = document.getElementById('workflow-panel');
    if (panel) void htmx.ajax('GET', `/requests/${number}/workflow`, { target: panel, swap: 'outerHTML' });
  };

  const off = onEvent((e) => {
    if (e.requestId !== requestId) return;
    const panel = document.getElementById('workflow-panel');
    if (e.toStatus && panel?.dataset.status !== e.toStatus) {
      refresh();
      if (e.actorId !== me)
        toast({
          type: 'info',
          title: `#${number} updated`,
          message: `Status changed to ${e.toStatus.replace(/_/g, ' ').toLowerCase()}.`,
        });
    } else if (e.type === 'request.commented' && e.actorId !== me) {
      toast({
        type: 'info',
        title: `New comment on #${number}`,
        message: 'Reload to read the latest discussion.',
        href: `/requests/${number}#comments`,
      });
    } else if (e.type === 'request.deleted' && e.actorId !== me) {
      toast({ type: 'warning', message: `#${number} was deleted.`, href: '/requests' });
    }
  });
  const offResync = onResync(refresh);
  return () => {
    off();
    offResync();
  };
});
