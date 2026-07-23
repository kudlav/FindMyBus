<script lang="ts">
    import { _ } from "svelte-i18n";
    import { settingsStore } from "../../../../stores";
    import { fetchStaticGtfs } from "$lib/gtfs/api";
    import { portal } from "$lib/actions/portal";

    import { Block, Button, Dialog, DialogButton, ListInput, Progressbar } from "konsta/svelte";

    let url = $settingsStore.staticGtfsUrl;
    let working = false;
    let error = '';
    let progress = 0;
    let phase = '';

    async function onClick() {
        if (working) {return}; // make sure we're not doing this twice at the same time

        working = true;
        error = '';

        try {
            await fetchStaticGtfs(url, (newProgress, newPhase) => {
                progress = newProgress;
                phase = newPhase;
            }); // attempt to fetch the feed with the provided URL

            // That was simple - everything seems to have gone fine!
            $settingsStore.staticGtfsUrl = url;
            working = false;
        } catch(exception) {
            // Oh oh, something failed - this shows the error dialog
            console.error(exception);

            try {
                // @ts-ignore
                error = JSON.stringify(exception.message || exception.toString());
            } catch {error = $_('generic.error')}
        }
    }
</script>

<style>
    .center {
        display: flex;
        justify-content: center;
    }

    .button {
        max-width: 350px;
    }
</style>

<ListInput label={$_('settings.staticGtfsFeedSetting.label')} placeholder="https://gtfs.example.com/..." type="url" value={url} onInput={function(e) {url = e.target.value.replaceAll(' ', '')}}/>

<div class="center">
    <div class="button">
        <Button disabled={working || url === ''} {onClick}>
            {#if url === $settingsStore.staticGtfsUrl && url != ''}
                {$_('settings.staticGtfsFeedSetting.refresh')}
            {:else}
                {$_('settings.staticGtfsFeedSetting.set')}
            {/if}
        </Button>
    </div>
</div>

<div use:portal>
    <Dialog opened={working && !error}>
        <svelte:fragment slot="title">{$_('settings.staticGtfsFeedSetting.dialog.title')}</svelte:fragment>
        <div class="mb-4">
            {$_(`settings.staticGtfsFeedSetting.dialog.${phase}`)}
        </div>
        <div class="mb-4">
            <Progressbar progress={progress} />
        </div>
    </Dialog>

    <Dialog opened={working && error.length > 0} onBackdropClick={function() {working = false}}>
        <svelte:fragment slot="title">{$_('generic.error')}</svelte:fragment>
        {$_('settings.staticGtfsFeedSetting.dialog.errors.failed')}

        <Block strong>
            {error}
        </Block>

        <svelte:fragment slot="buttons">
            <DialogButton onClick={function() {working = false}} strong>{$_('generic.confirm')}</DialogButton>
        </svelte:fragment>
    </Dialog>
</div>