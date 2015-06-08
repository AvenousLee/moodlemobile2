// (C) Copyright 2015 Martin Dougiamas
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

angular.module('mm.addons.messages')

/**
 * Messages factory.
 *
 * @module mm.addons.messages
 * @ngdoc service
 * @name $mmaMessages
 */
.factory('$mmaMessages', function($mmSite, $log, $q) {
    $log = $log.getInstance('$mmaMessages');

    var self = {};

    /**
     * Add a contact.
     *
     * @module mm.addons.messages
     * @ngdoc method
     * @name $mmaMessages#addContact
     * @param {Number} to User ID of the person to add.
     * @return {Promise}
     */
    self.addContact = function(userId) {
        return $mmSite.write('core_message_create_contacts', {
            userids: [ userId ]
        }).then(function() {
            return self.invalidateAllContactsCache($mmSite.getUserId());
        });
    };

    /**
     * Block a contact.
     *
     * @module mm.addons.messages
     * @ngdoc method
     * @name $mmaMessages#blockContact
     * @param {Number} to User ID of the person to block.
     * @return {Promise}
     */
    self.blockContact = function(userId) {
        return $mmSite.write('core_message_block_contacts', {
            userids: [ userId ]
        }).then(function() {
            return self.invalidateAllContactsCache($mmSite.getUserId());
        });
    };

    /**
     * Get all the contacts of the current user.
     *
     * @module mm.addons.messages
     * @ngdoc method
     * @name $mmaMessages#getAllContacts
     * @return {Promise} Resolved with the WS data.
     */
    self.getAllContacts = function() {
        return self.getContacts().then(function(contacts) {
            return self.getBlockedContacts().then(function(blocked) {
                contacts.blocked = blocked.users;
                return contacts;
            }, function() {
                // The WS for blocked contacts might not be available yet, but we still want the contacts.
                contacts.blocked = [];
                return contacts;
            });
        });
    };

    /**
     * Get all the blocked contacts of the current user.
     *
     * @module mm.addons.messages
     * @ngdoc method
     * @name $mmaMessages#getBlockedContacts
     * @return {Promise} Resolved with the WS data.
     */
    self.getBlockedContacts = function() {
        var params = {
                userid: $mmSite.getUserId()
            },
            presets = {
                cacheKey: self._getCacheKeyForBlockedContacts($mmSite.getUserId())
            };
        return $mmSite.read('core_message_get_blocked_users', params, presets);
    };

    /**
     * Get the cache key for contacts.
     *
     * @module mm.addons.messages
     * @ngdoc method
     * @name $mmaMessages#_getCacheKeyForContacts
     * @return {String}
     * @protected
     */
    self._getCacheKeyForContacts = function() {
        // Note: the contacts WS does not take arguments, so we do not need any here.
        return 'mmaMessages:contacts';
    };

    /**
     * Get the cache key for blocked contacts.
     *
     * @module mm.addons.messages
     * @ngdoc method
     * @name $mmaMessages#_getCacheKeyForBlockedContacts
     * @param {Number} userId The user who's contacts we're looking for.
     * @return {String}
     * @protected
     */
    self._getCacheKeyForBlockedContacts = function(userId) {
        return 'mmaMessages:blockedContacts:' + userId;
    };

    /**
     * Get the cache key for a discussion.
     *
     * @module mm.addons.messages
     * @ngdoc method
     * @name $mmaMessages#_getCacheKeyForDiscussion
     * @param {Number} userId The other person with whom the current user is having the discussion.
     * @return {String}
     * @protected
     */
    self._getCacheKeyForDiscussion = function(userId) {
        return 'mmaMessages:discussion:' + userId;
    };

    /**
     * Get the cache key for the list of discussions.
     *
     * @module mm.addons.messages
     * @ngdoc method
     * @name $mmaMessages#_getCacheKeyForDiscussions
     * @return {String}
     * @protected
     */
    self._getCacheKeyForDiscussions = function() {
        return 'mmaMessages:discussions';
    };

    /**
     * Get the contacts of the current user.
     *
     * This excludes the blocked users.
     *
     * @module mm.addons.messages
     * @ngdoc method
     * @name $mmaMessages#getContacts
     * @return {Promise} Resolved with the WS data.
     */
    self.getContacts = function() {
        var presets = {
                cacheKey: self._getCacheKeyForContacts()
            };
        return $mmSite.read('core_message_get_contacts', undefined, presets);
    };

    /**
     * Return the current user's discussion with another user.
     *
     * @module mm.addons.messages
     * @ngdoc method
     * @name $mmaMessages#getDiscussion
     * @param {Number} userId The ID of the other user.
     * @return {Promise}
     */
    self.getDiscussion = function(userId) {
        var messages,
            presets = {
                cacheKey: self._getCacheKeyForDiscussion(userId)
            },
            params = {
                useridto: $mmSite.getUserId(),
                useridfrom: userId,
                limitfrom: 0,
                limitnum: 50
            };

        return self._getRecentMessages(params, presets).then(function(response) {
            messages = response;
            params.useridto = userId;
            params.useridfrom = $mmSite.getUserId();

            return self._getRecentMessages(params, presets).then(function(response) {
                return messages.concat(response);
            });
        });
    };

    /**
     * Get the discussions of the current user.
     *
     * @module mm.addons.messages
     * @ngdoc method
     * @name $mmaMessages#getDiscussions
     * @return {Promise} Resolved with an object where the keys are the user ID of the other user.
     */
    self.getDiscussions = function() {
        var discussions = {},
            presets = {
                cacheKey: self._getCacheKeyForDiscussions()
            },
            promise;

        return self._getRecentMessages({
            useridto: $mmSite.getUserId(),
            useridfrom: 0,
            limitfrom: 0,
            limitnum: 50
        }, presets).then(function(messages) {

            // Extract the discussions by filtering same senders.
            angular.forEach(messages, function(message) {
                if (typeof discussions[message.useridfrom] === 'undefined') {
                    discussions[message.useridfrom] = {
                        fullname: message.userfromfullname,
                        profileimageurl: ""
                    };

                    if (!message.timeread) {
                        discussions[message.useridfrom].unread = true;
                    }

                    discussions[message.useridfrom].message = {
                        user: message.useridfrom,
                        message: message.smallmessage,
                        timecreated: message.timecreated
                    };
                }
            });

            // Now get the last messages sent from which we might not have received a reply yet.
            return self._getRecentMessages({
                useridfrom: $mmSite.getUserId(),
                useridto: 0,
                limitfrom: 0,
                limitnum: 50
            }, presets).then(function(messages) {

                // Extract the discussions by filtering same senders.
                angular.forEach(messages, function(message) {
                    if (typeof discussions[message.useridto] === 'undefined') {
                        discussions[message.useridto] = {
                            fullname: message.usertofullname,
                            profileimageurl: ""
                        };

                        if (!message.timeread) {
                            discussions[message.useridto].unread = true;
                        }

                        discussions[message.useridto].message = {
                            user: message.useridto,
                            message: message.smallmessage,
                            timecreated: message.timecreated
                        };
                    }
                });

                // Now get the contacts
                return self.getContacts().then(function(contacts) {
                    var types = ['online', 'offline', 'strangers'];

                    angular.forEach(types, function(type) {
                        if (contacts[type] && contacts[type].length > 0) {
                            angular.forEach(contacts[type], function(contact) {

                                if (typeof discussions[contact.id] === 'undefined' && contact.unread) {
                                    // It's a contact with unread messages. Contacts without unread messages are not used.
                                    discussions[contact.id] = {
                                        fullname: contact.fullname,
                                        profileimageurl: "",
                                        message: {
                                            user: contact.id,
                                            message: "...",
                                            timecreated: 0,
                                        }
                                    };
                                }

                                if (typeof discussions[contact.id] !== 'undefined') {
                                    // The contact is used in a discussion.
                                    if (contact.profileimageurl) {
                                        discussions[contact.id].profileimageurl = contact.profileimageurl;
                                    }
                                    if (typeof contact.unread !== 'undefined') {
                                        discussions[contact.id].unread = contact.unread;
                                    }
                                }
                            });
                        }
                    });

                    return discussions;
                });
            });
        });
    };

    /**
     * Get messages according to the params.
     *
     * @module mm.addons.messages
     * @ngdoc method
     * @name $mmaMessages#_getMessages
     * @param {Object} params Parameters to pass to the WS.
     * @param {Object} presets Set of presets for the WS.
     * @return {Promise}
     * @protected
     */
    self._getMessages = function(params, presets) {
        params = angular.extend(params, {
            type: 'conversations',
            newestfirst: 1,
        });

        return $mmSite.read('core_message_get_messages', params, presets);
    };

    /**
     * Get the most recent messages.
     *
     * @module mm.addons.messages
     * @ngdoc method
     * @name $mmaMessages#_getRecentMessages
     * @param {Object} params Parameters to pass to the WS.
     * @param {Object} presets Set of presets for the WS.
     * @return {Promise}
     * @protected
     */
    self._getRecentMessages = function(params, presets) {
        params = angular.extend(params, {
            read: 0
        });

        return self._getMessages(params, presets).then(function(response) {
            var messages = response.messages;
            if (messages) {
                if (messages.length >= params.limitnum) {
                    return messages;
                }

                // We need to fetch more messages.
                params.limitnum = params.limitnum - messages.length;
                params.read = 1;

                return self._getMessages(params, presets).then(function(response) {
                    if (response.messages) {
                        messages = messages.concat(response.messages);
                    }
                    return messages;
                }, function() {
                    return messages;
                });

            } else {
                return $q.reject();
            }
        });
    };

    /**
     * Invalidate all contacts cache.
     *
     * @module mm.addons.messages
     * @ngdoc method
     * @name $mmaMessages#invalidateAllContactsCache
     * @param {Number} userId The user ID.
     * @return {Promise}
     */
    self.invalidateAllContactsCache = function(userId) {
        return self.invalidateContactsCache().then(function() {
            return self.invalidateBlockedContactsCache(userId);
        });
    };

    /**
     * Invalidate blocked contacts cache.
     *
     * @module mm.addons.messages
     * @ngdoc method
     * @name $mmaMessages#invalidateBlockedContactsCache
     * @param {Number} userId The user ID.
     * @return {Promise}
     */
    self.invalidateBlockedContactsCache = function(userId) {
        return $mmSite.invalidateWsCacheForKey(self._getCacheKeyForBlockedContacts(userId));
    };


    /**
     * Invalidate contacts cache.
     *
     * @module mm.addons.messages
     * @ngdoc method
     * @name $mmaMessages#invalidateContactsCache
     * @return {Promise}
     */
    self.invalidateContactsCache = function() {
        return $mmSite.invalidateWsCacheForKey(self._getCacheKeyForContacts());
    };

    /**
     * Invalidate discussion cache.
     *
     * @module mm.addons.messages
     * @ngdoc method
     * @name $mmaMessages#invalidateDiscussionCache
     * @param {Number} userId The user ID with whom the current user is having the discussion.
     * @return {Promise}
     */
    self.invalidateDiscussionCache = function(userId) {
        return $mmSite.invalidateWsCacheForKey(self._getCacheKeyForDiscussion(userId));
    };

    /**
     * Invalidate discussions cache.
     *
     * Note that {@link $mmaMessages#getDiscussions} uses the contacts, so we need to invalidate contacts too.
     *
     * @module mm.addons.messages
     * @ngdoc method
     * @name $mmaMessages#invalidateDiscussionsCache
     * @return {Promise}
     */
    self.invalidateDiscussionsCache = function(userId) {
        return $mmSite.invalidateWsCacheForKey(self._getCacheKeyForDiscussions()).then(function(){
            return self.invalidateContactsCache();
        });
    };

    /**
     * Checks if the a user is blocked by the current user.
     *
     * @module mm.addons.messages
     * @ngdoc method
     * @name $mmaMessages#isBlocked
     * @param {Number} userId The user ID to check against.
     * @return {Promise} Resolved with boolean, rejected when we do not know.
     */
    self.isBlocked = function(userId) {
        return self.getBlockedContacts().then(function(blockedContacts) {
            var blocked = false;
            if (!blockedContacts.users || blockedContacts.users.length < 1) {
                return blocked;
            }
            angular.forEach(blockedContacts.users, function(user) {
                if (userId == user.id) {
                    blocked = true;
                }
            });
            return blocked;
        });
    };

    /**
     * Checks if the a user is a contact of the current user.
     *
     * @module mm.addons.messages
     * @ngdoc method
     * @name $mmaMessages#isContact
     * @param {Number} userId The user ID to check against.
     * @return {Promise} Resolved with boolean, rejected when we do not know.
     */
    self.isContact = function(userId) {
        return self.getContacts().then(function(contacts) {
            var isContact = false,
                types = ['online', 'offline'];

            angular.forEach(types, function(type) {
                if (contacts[type] && contacts[type].length > 0) {
                    angular.forEach(contacts[type], function(user) {
                        if (userId == user.id) {
                            isContact = true;
                        }
                    });
                }
            });

            return isContact;
        });
    };

    /**
     * Returns whether or not the plugin is enabled for the current site.
     *
     * @module mm.addons.messages
     * @ngdoc method
     * @name $mmaMessages#isPluginEnabled
     * @return {Boolean}
     */
    self.isPluginEnabled = function() {
        var infos;

        if (!$mmSite.isLoggedIn()) {
            return false;
        } else if (!$mmSite.canUseAdvancedFeature('messaging')) {
            return false;
        } else if (!$mmSite.wsAvailable('core_message_get_messages')) {
            return false;
        }

        return true;
    };

    /**
     * Returns whether or not we can search contacts.
     *
     * @module mm.addons.messages
     * @ngdoc method
     * @name $mmaMessages#isSearchEnabled
     * @return {Boolean}
     */
    self.isSearchEnabled = function() {
        return $mmSite.wsAvailable('core_message_search_contacts');
    };

    /**
     * Remove a contact.
     *
     * @module mm.addons.messages
     * @ngdoc method
     * @name $mmaMessages#removeContact
     * @param {Number} to User ID of the person to remove.
     * @return {Promise}
     */
    self.removeContact = function(userId) {
        return $mmSite.write('core_message_delete_contacts', {
            userids: [ userId ]
        }, {
            responseExpected: false
        }).then(function() {
            return self.invalidateContactsCache();
        });
    };

    /**
     * Search for contacts.
     *
     * By default this only returns the first 100 contacts, but note that the WS can return thousands
     * of results which would take a while to process. The limit here is just a convenience to
     * prevent viewed to crash because too many DOM elements are created.
     *
     * @module mm.addons.messages
     * @ngdoc method
     * @name $mmaMessages#searchContacts
     * @param {String} query The query string.
     * @param {Number} [limit=100] The number of results to return, 0 for none.
     * @return {Promise}
     */
    self.searchContacts = function(query, limit) {
        var data = {
                searchtext: query,
                onlymycourses: 0
            };
        limit = typeof limit === 'undefined' ? 100 : limit;
        return $mmSite.read('core_message_search_contacts', data).then(function(contacts) {
            if (limit && contacts.length > limit) {
                contacts = contacts.splice(0, limit);
            }
            return contacts;
        });
    };

    /**
     * Send a message to someone.
     *
     * @module mm.addons.messages
     * @ngdoc method
     * @name $mmaMessages#sendMessage
     * @param {Number} to User ID to send the message to.
     * @param {String} message The message to send
     * @return {Promise}
     */
    self.sendMessage = function(to, message) {
        return $mmSite.write('core_message_send_instant_messages', {
            messages: [
                {
                    touserid: to,
                    text: message,
                    textformat: 1
                }
            ]
        }).then(function() {
            return self.invalidateDiscussionCache(to);
        });
    };

    /**
     * Helper method to sort messages by time.
     *
     * @module mm.addons.messages
     * @ngdoc method
     * @name $mmaMessages#sortMessages
     * @param {Object[]} messages Array of messages containing the key 'timecreated'.
     * @return {Object[]} Messages sorted with most recent last.
     */
    self.sortMessages = function(messages) {
        return messages.sort(function (a, b) {
            a = parseInt(a.timecreated, 10);
            b = parseInt(b.timecreated, 10);
            return a >= b ? 1 : -1;
        });
    };

    /**
     * Unblock a user.
     *
     * @module mm.addons.messages
     * @ngdoc method
     * @name $mmaMessages#unblockContact
     * @param {Number} to User ID of the person to unblock.
     * @return {Promise}
     */
    self.unblockContact = function(userId) {
        return $mmSite.write('core_message_unblock_contacts', {
            userids: [ userId ]
        }).then(function() {
            return self.invalidateAllContactsCache($mmSite.getUserId());
        });
    };

    return self;
});
