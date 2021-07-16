// Todo: When Tab-Group is moved to another window with same group open, merge them
// Todo: Handle Empty folders created when switching to new group
// Todo: Handle bookmark group rename - hard  because old name is not given, use bookmarks in folder to see if any are in open groups?


chrome.commands.onCommand.addListener(cmdHandler)
chrome.bookmarks.onCreated.addListener(bookmarkHandler)
chrome.bookmarks.onMoved.addListener(bookmarkHandler)
//chrome.bookmarks.onChanged.addListener(bookmarkChanged)
chrome.tabs.onUpdated.addListener(tabHandler)
chrome.tabs.onActivated.addListener(tabActivated)
chrome.tabGroups.onUpdated.addListener(tabGroupHandler)
chrome.tabs.onDetached.addListener(tabHandler)


var rootID = "1";
var tabgroupnames = []

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// handle Keyboard Shortcuts
async function cmdHandler(command) {

  let tabs = await chrome.tabs.query({active: true, currentWindow: true})

  if(tabs && tabs[0] && tabs[0].status == "complete") {
    let tab = tabs[0];
    groupid = tab.groupId;

    // Bookmark active Tab by Group
    bookmarkByGroup(tab,false,command);

    // Bookmark all Tabs in same Group as active Tab in current window
    if (command.match("group")) {
      tabs = await chrome.tabs.query({currentWindow: true, active: false});

      tabs.forEach(t => {
        if(t.groupId == groupid) {
          if(t.status == "complete")
            bookmarkByGroup(t,false,command);
        }
      });

    }
  }
}


// handle Bookmark creation and movement (via Star in browser UI)
async function bookmarkHandler(id,nodeorchange){

  let node = null

  try {
    node = await chrome.bookmarks.get(String(id))
  }
  catch(error) {
    // temp bookmark doesn't exist anymore
    return;
  }


  node = node[0]
  console.log(id,node);

  // Move the bookmark if it's in one of the base folders (bookmark bar, other bookmarks, root)
  if(node.parentId <=2 ) {
    let tabs = await chrome.tabs.query({active: true, currentWindow: true})

    if(tabs && tabs[0] && tabs[0].status == "complete") {
      let tab = tabs[0];

      // Only if current active tab was bookmarked or moved and is in a tabGroup ...
      if(tab.url == node.url && tab.groupId != -1) {
        groupid = tab.groupId;

        // ... bookmark/move active Tab by Group
        bookmarkByGroup(tab,String(id));
      }
    }

  }
  // move the tab if necessary
  else {
    let tabs = await chrome.tabs.query({url: node.url }) //, currentWindow: true})

    if(tabs && tabs[0] && tabs[0].status == "complete") {
      let tab = tabs[0];

      let folder = await chrome.bookmarks.get(String(node.parentId));
      folder = folder[0]
      let tgroup = false
      
      if(tab.groupId != -1) tgroup = await chrome.tabGroups.get(tab.groupId)

      // check if tab is already in correct group
      if(tab.groupId == -1 || tgroup.title != folder.title ) {

        console.log('move',tab,tgroup.title,folder.title);
        addToGroup(folder.title,tab.id)

      }

    }

  }

};


async function bookmarkByGroup(tab,bookmark,command) {

  var group = null;
  var groupid = null;
  var root = 0;
  var folder = "unsorted";

  if(!command) command = ""

  if(tab.groupId != -1) {
    group = await chrome.tabGroups.get(tab.groupId);
    if(group) folder = group.title;
  }


  let nodes = await chrome.bookmarks.search({title: folder});

  console.log(nodes,folder,tab)

  if(nodes.length > 0) root = nodes[0];
  else {
    root = await chrome.bookmarks.create( {'parentId': rootID, 'title': folder})
  } 

  // create bookmark  
  var exists = false;

  let children = await chrome.bookmarks.getChildren(root.id)

  for (var i = 0; i < children.length; ++i) {
    node = children[i]

    if(node.url == tab.url) {
      exists = true;
      break;
    }
  }


  if(!exists) {
    console.log(bookmark,root)
    if(bookmark)
      await chrome.bookmarks.move(bookmark,{parentId: root.id})
    else
      await chrome.bookmarks.create( {'parentId': root.id, 'title': tab.title, 'url': tab.url}); //, bookmarkTab );
  } 

  console.log("command",command)

  if(command.match("suspend")) {
    await chrome.tabs.remove(tab.id);
  }
}


var lastGroup = -1;

async function tabActivated(info) {

  console.log(info)
  try {
    var tab = await chrome.tabs.query({active: true, windowId: info.windowId});
    tab = tab[0]
    console.log(tab)

    // Create temp bookmark if tab is in a group and not yet bookmarked
    if(tab.groupId != -1 && tab.groupId != lastGroup) {
console.log('go')
      group = await chrome.tabGroups.get(tab.groupId);
console.log('go')
      group = await chrome.tabGroups.get(tab.groupId);
      if(group) folder = group.title;
      
      console.log(folder)

      let nodes = await chrome.bookmarks.search({title: folder});
      console.log(nodes)

      if(nodes.length > 0) root = nodes[0];
      else {
        root = await chrome.bookmarks.create( {'parentId': rootID, 'title': folder})
      } 

      console.log(nodes,root);

      var tempbm = await chrome.bookmarks.create( {'parentId': root.id, 'title': tab.title, 'url': tab.url}); //, bookmarkTab );
      console.log('temp',tempbm)
      await chrome.bookmarks.remove(tempbm.id);


      lastGroup = tab.groupId
    }

  } catch (error) {
    console.log('Error',error)
    if (error == 'Error: Tabs cannot be queried right now (user may be dragging a tab).') {
      setTimeout(() => tabActivated(info), 50);
    }
  }
}



var delay = 0;

async function tabHandler(tabID,changeInfo,tab) {

  console.log(tabID,tab,changeInfo)

  try {
    if(changeInfo.url != null || changeInfo.oldWindowId != null){ 

      let url = null
      if(changeInfo.url) url = changeInfo.url
      else {
        tab = await chrome.tabs.get(tabID)
        url = tab.url
      }
console.log(url)
      // Sleep a little if another instance of this function is running, so there is only one group created when multiple bookmarks are opened
      if(delay > 0) await sleep(delay);
      delay = 100;

      let nodes = await chrome.bookmarks.search({url: url});

      let result = await handleNodes(nodes,tabID)

      if(!result && tab.groupId == -1) {
        let domain = (new URL(url));
        domain = domain.origin;
        nodes = await chrome.bookmarks.search({url: domain});
        result = await handleNodes(nodes,tabID)
      }


      if(!result && tab.groupId == -1) {
        let domain = (new URL(url));
        domain = domain.hostname;
        nodes = await chrome.bookmarks.search({query: domain});
        result = await handleNodes(nodes,tabID)
      }

      delay = 0

    }
    // Move existing bookmark when Tab changes groups
    else if(changeInfo.groupId != null && changeInfo.groupId != -1) {

      let nodes = await chrome.bookmarks.search({url: tab.url});

      if(nodes && nodes.length == 1) {
        let bookmark = nodes[0]
        await bookmarkByGroup(tab,bookmark.id) 
      }

    }
  }
  catch(error) {
    console.log(error)
    if (error == 'Error: Tabs cannot be edited right now (user may be dragging a tab).') {
      setTimeout(() => tabHandler(tabID,changeInfo,tab), 50);
    }
  }
}

async function handleNodes(nodes,tabID) {

  if(nodes.length == 1){
    node = nodes[0]

    if(node.parentId > 2) {
      let pnode = await chrome.bookmarks.get(node.parentId)
      if((pnode[0]).parentId != "0") 
        await addToGroup(pnode[0].title,tabID)
    }

    return true;
  }
  else if(nodes.length > 1) {

    var unique = true
    var pId = -1

    for (var i = 0; i < nodes.length; ++i) {
      node = nodes[i]

      if(node.parentId > 2) {
        if(pId == -1) pId = node.parentId
        else if(pId != node.parentId) {
          unique = false
          break
        }
      }

    }

    if(unique && pId != -1) {
      let pnode = await chrome.bookmarks.get(pId)
      if((pnode[0]).parentId != "0") 
        await addToGroup(pnode[0].title,tabID)
    }

    return true;
  }
  else return false
}


async function addToGroup(folder,tabID) {

    // bug here
    let tab = await chrome.tabs.get(tabID);

    let groups = await chrome.tabGroups.query({windowId: tab.windowId}) // chrome.windows.WINDOW_ID_CURRENT

    var group = -1;

    for(var i =0; i < groups.length; ++i) {

      item = groups[i]

      if(item.title == folder) {
        group = item.id
        break;
      }
    }

    if(group != -1) {
      await chrome.tabGroups.update(group,{collapsed:false})
      await chrome.tabs.group({groupId: group, tabIds: tabID})
    }
    else {
      let groupID = await chrome.tabs.group({createProperties: {windowId: tab.windowId} ,tabIds: tabID })
      await chrome.tabGroups.update(groupID,{title: folder, color: getColor(folder)})
      tabgroupnames[groupID] = folder
    }

    // handle case where tab was first activated and then grouped
    tabActivated({windowId: tab.windowId})
}

// Get a predictable Color for each tabGroup title
function getColor(name) {
  let colors = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan" ]
  let c = 0 

  for(var i=0;i<name.length;i++) {
    c = c + name.charCodeAt(i);
  }

  return colors[(c % 8)];
}



// handle creation & renaming of tab groups
async function tabGroupHandler(group) {
//  console.log('tgu',tabgroupnames)
  if(group.title !== ""){
    if(tabgroupnames[group.id] === undefined) {
      tabgroupnames[group.id] = group.title
    }
    else if(tabgroupnames[group.id] !== group.title) {
      console.log(group)
      tabgroupnames[group.id] = group.title

      // update group color
      await chrome.tabGroups.update(group.id,{color: getColor(group.title)})

      let tabs = await chrome.tabs.query({}) // groupId: group.id doesn't work

      console.log(tabs)

      if(tabs.length > 0){

        let folderId = -1

        for (var i = 0; i < tabs.length; i++) 
        {
          let tab = tabs[i]
          if(tab.groupId == group.id){
            let bm = await chrome.bookmarks.search({url: tab.url})
            console.log(bm)
            if(bm.length > 1 || bm.length == 0) continue;

            let parentId = bm[0].parentId

            if(folderId == -1) folderId = parentId

            if(folderId != parentId ) {
              folderId = -2
              break
            } 
          }
        }

        console.log(folderId)

        if(folderId > 0 ) {
          //let folder = await chrome.bookmarks.get(folderId)

          await chrome.bookmarks.update(folderId,{title: group.title})

        }


      }
    }
  }
}


async function bookmarkChanged(id,info) {

  console.log(id,info)

}
