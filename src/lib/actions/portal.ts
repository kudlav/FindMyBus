export function portal(node: HTMLElement, target: string | HTMLElement = '.k-app') {
    let targetEl = typeof target === 'string' ? document.querySelector(target) : target;
    if (!targetEl) {
        targetEl = document.body;
    }
    targetEl.appendChild(node);

    return {
        destroy() {
            if (node.parentNode) {
                node.parentNode.removeChild(node);
            }
        }
    };
}
