# bugs related to personal collection/vault and catalog

12. songs added to queue does not have option to remove from queue in three dots menu, also queue bar should also have left swipe to remove the song from queue. and the single song bar should have swipe to right to add the song to queue.
13. after deleting the song permanently/soft delete the player was still able to play it if it was already playing, which is fine but that also means there is no check for soft delete or deleted songs on /stream endpoint, should we have it or not, nor there is a check if the song its requesting is in requesting user's personal collection or not if its a personal collection song.
14. No go to release or artist page on clicking song's name or artist name on song bar.
15. sometimes creating a room get stuck at loading and then if i reload and then create again it immediately creates and joins.

# Need to verify once more -

3. the song uploaded does not show up in the temp artist or even global pages or searches even though config is there.

# Fixed:

1. when user uploads files client should deduplicate the songs which had same name, aritists, duration and album name. and should show the no. of duplicates removed to user for clarification to them.
2. same deduplication should happen at server where if a song that is already present (exactly same metadata) in that user's personal collection it should not get uploaded. remember we only check for duplicates on that person's personal collection and not in global uploads or in other person's personal collection collection.
3. the songs with same album name should be in same release as a EP/ALBUM/MIXTAPE/LP and there should be an option to detach/remove a song from album and upload it as single and also add a single to an identified album. maybe create a empty release to put different single in it like a mixtape EP or LP.
4. song having muliple artist has artist data as comma separated (ex- "artist1, ARTIST 2, aRtist3) and the personal collection artist that gets created on db is a single combined artist which is not good. what i was thinking that a we choose the first artist in the string as main artist and make others the collaborators. and if later that user uploads songs of artist that is already there to the personal collection it should not create another artist profile.
5. the artist page should have a filtering option for those who enabled sandboxed artist to get showed on artists page for showing only the global artist, personal collection artist and all option, maybe other sorting filters like montly listeners, followers amount etc if disabled sandboxed artist to come up in artists pages only global artists should show up.
6. An artists section in personal collection that shows all the sandboxed artist belonging to user's personal collection.
7. currently personal collection's songs get soft-deleted but there is no option to restore them or permanently delete them, and make sure the soft deleted songs does not appear in any other place like listen history, artist pages etc. create this section inside the collections page only.
8. i just copy pasted the artist page details of an artist that was from my personal vault and pasted in another browser with different login and i was able to access the song, see the artist page. and there are many loophole like this.
9. use plan feature for quota limit in personal collection
10. `music-metadata-browser` is officially deprecated, and its own package documentation says development was discontinued because current `music-metadata`
11. the metadata extraction is not correct, the mp3 when played on local player shows full metadata including artists, thumbnails etc and other things but not when i try to upload them and the duration is also coming as 0:00.
12. user can't see the songs he has added to personal collection, to manage the songs like deleting
13. the styling of personal collection modal is not at all matching the rest of the application.
14. the song upload fails after one upload and only works if you reload.
15. immediate server cleanup of duplicate uploaded raw audio keys and cover art in R2 when duplicate tracks/releases are skipped on bulk import.
16. metadata extraction feature for global releases to prefill release/song title, genre, duration, explicit advisory flag, embedded cover art (uploaded to R2), and batch cut importing with sequential ordering in Artist Studio.
17. One tap login not working.
18. added /search page to client
19. No permanent delete option in studio trash.
20. sidebars and bottom bar for mobile
21. songs presaved by user should go back to be normally saved instead of being kept as presaved, the stale entry is still there in db.
22. soft deleted songs still show in listen history and are playable
23. there is no artist profile pic only banner, need to have profile pic

# Things to check (later):

- Check if the redis to db flush logic are properly handled for other services too.
- have default cover images and profile pics
- add keyboard listeners for better player controls
- cron job to purge the personal vault artist that don't have a song attached to them.
- review the whole playlist system again with jam and personal collection in mind.
