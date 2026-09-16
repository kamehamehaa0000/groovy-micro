# bugs related to personal collection/vault and catalog

2. the song upload fails after one upload and only works if you reload.
3. the song uploaded does not show up in the temp artist or even global pages or searches even though config is there.
4. the artist i put was named 'kr$na' but there is a verified artist named 'KR$NA' but that did not work and the personal collection section on artist page that we made only showed up on 'kr$na', can this be sophisticatically solved.

5. the artist page should have a filtering option for those who enabled sandboxed artist to get showed on artist page for showing only the global artist, personal collection artist and all option, maybe other sorting filters like montly listeners, followers amount etc
6. i just copy pasted the artist page details of an artist that was from my personal vault and pasted in another browser with different login and i was able to access the song, see the artist page. and there are many loophole like this.
7. metadata pulls multiple artist separated by commas, you can assign first name as main artist and others as collaborators.
8. creating a functionality for user to edit the artist and collaborator for a personal collection release so he or she can go to the dashboard edit the song's artist - where she can search existing artist(only non global) artist, create non global vault only artist to properly tag songs to like it happens for current official global releases.
9. add this metadata extraction feature for global releases also to prefill the form as much as possible.
10. during upload after metadata extraction the same "album name" tracks should by default be grouped but should have a button to split them into a single. or add a single to an identified album.

11. currently soft delete vaults songs but does not have a restore functionality and the restore functinoality should have a functionality to delete permanently.
12. use plan feature for quota limit in personal collection

# Fixed:

1. `music-metadata-browser` is officially deprecated, and its own package documentation says development was discontinued because current `music-metadata`
2. the metadata extraction is not correct, the mp3 when played on local player shows full metadata including artists, thumbnails etc and other things but not when i try to upload them and the duration is also coming as 0:00.
3. user can't see the songs he has added to personal collection, to manage the songs like deleting
4. the styling of personal collection modal is not at all matching the rest of the application.

# other bugs :

1. songs presaved by user should go back to be normally saved instead of being kept as presaved, the stale entry is still there in db.
2. play count not showing on release page.
3. No go to release or artist page on clicking song's name or artist name on song bar.
4. One tap login not working.
5. sometimes creating a room get stuck at loading and then if i reload and then create again it immediately creates and joins.
6.

Things to check:

- Check if the redis to db flush logic are properly handled for other services too.
- have default cover images and profile pics
