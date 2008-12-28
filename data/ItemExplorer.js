dojo.provide("dojox.data.ItemExplorer");
dojo.require("dijit.Tree");
dojo.require("dijit.Dialog");
dojo.require("dijit.Menu");
dojo.require("dijit.form.ValidationTextBox");
dojo.require("dijit.form.Textarea");
dojo.require("dijit.form.Button");
dojo.require("dijit.form.CheckBox");
dojo.require("dijit.form.FilteringSelect");

(function(){
    var getValue = function(store, item, prop){
        var value = store.getValues(item, prop);
        if(value.length < 2){
            value = store.getValue(item, prop);
        }
        return value;
    }
    
dojo.declare("dojox.data.ItemExplorer", dijit.Tree, {
    useSelect: false,
    refSelectSearchAttr: null,
	constructor: function(options){
        dojo.mixin(this, options);
		var self = this;
		var initialRootValue = {};
		var root = this.rootModelNode = {value:initialRootValue};
		
		var modelNodeIndex = this._modelNodeIndex = {};
		this.model = {
			getRoot: function(onItem){
				onItem(root);
			},
			mayHaveChildren: function(modelNode){
				return modelNode.value && typeof modelNode.value == 'object' && !(modelNode.value instanceof Date);
			},
			getChildren: function(parentModelNode, onComplete, onError){
				var keys, parent, item = parentModelNode.value;
				var children = [];
				if(item == initialRootValue){
					onComplete([]);
					return;
				}
				var isItem = self.store && self.store.isItem(item);
				
				if(isItem){
					// get the properties through the dojo data API
					keys = self.store.getAttributes(item);
                    parent = item;
				}else if(item && typeof item == 'object'){
                    parent = parentModelNode;
					keys = [];
					// also we want to be able to drill down into plain JS objects/arrays
					for(var i in item){
						if(item.hasOwnProperty(i) && i != '__id' && i != '__clientId'){
							keys.push(i);
						}
					}
				}
				if(keys){
					for(var key, k=0; key = keys[k++];){
						if(isItem){
                            var value = getValue(self.store, item, key);
						}else{
							value = item[key];
						}
						
						if(self.store.isItem(value) && !self.store.isItemLoaded(value)){
							self.store.loadItem({item:value});
						}
						children.push({property:key, value: value, parent:  parent});
					}
					children.push({addNew:true, parent: parent, parentNode : parentModelNode});
				}
				onComplete(children);
			},
			getIdentity: function(modelNode){
				if(modelNode.addNew){
					modelNode.property = "--addNew";
				}
				var identity = modelNode === root ? "root" : 
							(((self.store && self.store.getIdentity(modelNode.parent)) || Math.random()) + "." + modelNode.property);
				modelNodeIndex[identity] = modelNode;
				return identity;
			},
			getLabel: function(modelNode){
				return modelNode === root ?
						"Object Properties" : 
							modelNode.addNew ? (modelNode.parent instanceof Array ? "Add new value" : "Add new property") : 
								modelNode.property + ": " + modelNode.value;
			},
			onChildrenChange: function(modelNode){
			},
			onChange: function(modelNode){
			}
		};
	},
	postCreate: function(){
		this.inherited(arguments);
		// handle the clicking on the "add new property item"
		dojo.connect(this, "onClick", function(modelNode, treeNode){
			if(modelNode.addNew){
				if(modelNode.parent.value instanceof Array){
	            	modelNode.property = modelNode.parent.value.length; 
	                this._editProperty(); // this does not work as expected...
	            }else{
	                this.focusNode(treeNode.getParent());
	                this._addProperty();
	            }
			}else{
                this._editProperty();
            }
		});
        this._createContextMenu();		
	},
	store: null,
	setStore: function(store){
		this.store = store;
		var self = this;
		if(this._editDialog && this.useSelect){
			dojo.query(".reference [widgetId]", this._editDialog.containerNode).forEach(function(node){
	            dijit.getEnclosingWidget(node).attr("store", store);
	        });
		}
		dojo.connect(store, "onSet", function(item, attribute, oldValue, newValue){
			var propertyNode, identity = self.store.getIdentity(item);
			propertyNode = self._modelNodeIndex[identity + "." + attribute];
			if(oldValue === undefined || newValue === undefined || propertyNode === undefined){
				var root = self.rootModelNode;
				propertyNode = ((root.value == item) && root) || self._modelNodeIndex[identity];
				if(propertyNode){
					self.model.getChildren(propertyNode, function(children){
						self.model.onChildrenChange(propertyNode, children);
					});
				}
			}else if(propertyNode){
				propertyNode.value = newValue;
				if(oldValue instanceof Array || newValue instanceof Array || typeof oldValue == 'object' || typeof newValue == 'object'){
					self.model.getChildren(propertyNode, function(children){
						self.model.onChildrenChange(propertyNode, children);
					});
				}
				self.model.onChange(propertyNode);
			}
		});
		this.rootNode.setChildItems([]);
	},
	setItem: function(item){
		// this is called to show a different item
		this.rootModelNode.value = item;
		var self = this;
		this.model.getChildren(this.rootModelNode, function(children){
			self.rootNode.setChildItems(children);
		});
		
	},
    _createEditDialog: function(){
    	this._editDialog = new dijit.Dialog({
           title: "Edit Property",
           execute: dojo.hitch(this, "_updateItem"),
           preload: true
        });
        this._editDialog.placeAt(dojo.body());  
        this._editDialog.startup();
        
        // handle for dialog content
        var pane = dojo.doc.createElement('div');
        
        // label for property
        var labelProp = dojo.doc.createElement('label');
        dojo.attr(labelProp, "for", "property");
        dojo.style(labelProp, "fontWeight", "bold");
        dojo.attr(labelProp, "innerHTML", "Property:")
        pane.appendChild(labelProp);

        // property name field
        var propName = new dijit.form.ValidationTextBox({
            name: "property",
            value: "",
            required: true,
            disabled: true
        }).placeAt(pane);
        
        pane.appendChild(dojo.doc.createElement("br"));
        pane.appendChild(dojo.doc.createElement("br"));
        
        // radio button for "value"
        var value = new dijit.form.RadioButton({
            name: "itemType",
            value: "value",
            onClick: dojo.hitch(this, function(){this._enableFields("value");})
        }).placeAt(pane);
        
        // label for value
        var labelVal = dojo.doc.createElement('label');
        dojo.attr(labelVal, "for", "value");
        dojo.attr(labelVal, "innerHTML", "Value (JSON):")
        pane.appendChild(labelVal);
       
         // container for value fields
        var valueDiv = dojo.doc.createElement("div");
        dojo.addClass(valueDiv, "value");
             
        // textarea
        var textarea = new dijit.form.Textarea({
            name: "jsonVal",
            value: null
        }).placeAt(valueDiv);
        pane.appendChild(valueDiv);
        
        // radio button for "reference"
        var reference = new dijit.form.RadioButton({
            name: "itemType",
            value: "reference",
            onClick: dojo.hitch(this, function(){this._enableFields("reference");})
        }).placeAt(pane);
        
        // label for reference
        var labelRef = dojo.doc.createElement('label');
        dojo.attr(labelRef, "for", "_reference");
        dojo.attr(labelRef, "innerHTML", "Reference:")
        pane.appendChild(labelRef);
        pane.appendChild(dojo.doc.createElement("br"));
        
        // container for reference fields
        var refDiv = dojo.doc.createElement("div");
        dojo.addClass(refDiv, "reference");
        
        if(this.useSelect){
            // filteringselect
            // TODO: see if there is a way to sort the items in this list
            var refSelect = new dijit.form.FilteringSelect({
                name: "_reference",
                store: this.store,
                searchAttr: this.refSelectSearchAttr || this.store.getIdentityAttributes()[0],
                required: false,
                value: null,        // need to file a ticket about the fetch that happens when declared with value: null
                pageSize: 10
            }).placeAt(refDiv);
        }else{
            var refTextbox = new dijit.form.ValidationTextBox({
                name: "_reference",
                value: "",
                isValid: dojo.hitch(this, function(isFocused){
                    // don't validate while it's focused
                    return true;//isFocused || this.store.getItemByIdentity(this._editDialog.attr("value")._reference);
                })
            }).placeAt(refDiv);
        }
        pane.appendChild(refDiv);
        pane.appendChild(dojo.doc.createElement("br"));
        pane.appendChild(dojo.doc.createElement("br"));
        
        // buttons
        var buttons = document.createElement('div');
        buttons.setAttribute("dir", "rtl");
        var cancelButton = new dijit.form.Button({type: "reset", label: "Cancel"}).placeAt(buttons);
        cancelButton.onClick = dojo.hitch(this._editDialog, "onCancel");
        var okButton = new dijit.form.Button({type: "submit", label: "OK"}).placeAt(buttons);
        pane.appendChild(buttons);
        
        this._editDialog.attr("content", pane);
    }, 
    _createContextMenu: function(){
        // TODO: we could add icons to this if we wanted
        this._contextMenu = new dijit.Menu({
            targetNodeIds: [this.rootNode.domNode], 
            id: "contextMenu"
            });
        dojo.connect(this._contextMenu, "_openMyself", this, function(e){
            var node = dijit.getEnclosingWidget(e.target);
            if(node){
                var item = node.item;
                if(this.store.isItem(item.value) && !item.parent){
                    this._contextMenu.getChildren().forEach(function(widget){
                        widget.attr("disabled", (widget.label != "Add"));
                    });
                    this.lastFocused = node;
                    // TODO: Root Node - allow Edit when mutli-value editing is possible
                } else if(item.value && typeof item.value == 'object' && !(item.value instanceof Date) 
                        && !this.store.isItem(item.value)){ // an object that's not an item or Date 
                    this._contextMenu.getChildren().forEach(function(widget){
                        widget.attr("disabled", (widget.label != "Add") && (widget.label != "Delete"));
                    });
                    this.lastFocused = node;
                    // TODO: Object - allow Edit when mutli-value editing is possible
                } else if(item.property && dojo.indexOf(this.store.getIdentityAttributes(), item.property) >= 0){ // id node
                    this.focusNode(node);
                    alert("Cannot modify an Identifier node.");
                } else if(item.addNew){
                    this.focusNode(node);
                }else{
                    this._contextMenu.getChildren().forEach(function(widget){
                        widget.attr("disabled", (widget.label != "Edit") && (widget.label != "Delete"));
                    })
                    // this won't focus the node but gives us a way to reference the node
                    this.lastFocused = node;
                }
            }
        });
        this._contextMenu.addChild(new dijit.MenuItem({label: "Add", onClick: dojo.hitch(this, "_addProperty")}));
        this._contextMenu.addChild(new dijit.MenuItem({label: "Edit", onClick: dojo.hitch(this, "_editProperty")}));
        this._contextMenu.addChild(new dijit.MenuItem({label: "Delete", onClick: dojo.hitch(this, "_destroyProperty")}));
        this._contextMenu.startup();
    },
    _enableFields: function(selection){
        // enables/disables fields based on whether the value in this._editDialog is a reference or a primitive value
        switch(selection){
            case "reference":
                dojo.query(".value [widgetId]", this._editDialog.containerNode).forEach(function(node){
                    dijit.getEnclosingWidget(node).attr("disabled", true);
                });
                dojo.query(".reference [widgetId]", this._editDialog.containerNode).forEach(function(node){
                    dijit.getEnclosingWidget(node).attr("disabled", false);
                });
                break;
            case "value":
                dojo.query(".value [widgetId]", this._editDialog.containerNode).forEach(function(node){
                    dijit.getEnclosingWidget(node).attr("disabled", false);
                });
                dojo.query(".reference [widgetId]", this._editDialog.containerNode).forEach(function(node){
                    dijit.getEnclosingWidget(node).attr("disabled", true);
                });
                break;
        }
    },
    _updateItem: function(vals){
        // a single "execute" function that handles adding and editing of values and references.
        var node, item, val, storeItemVal, editingItem = dijit.getEnclosingWidget(dojo.query("input[name='property']", this._editDialog.containerNode)[0]).attr("disabled");
		var editDialog = this._editDialog;
		var store = this.store;
        function setValue(){
            var itemVal, propPath = [];
            if(editingItem){
                while(!store.isItem(item.parent)){
                    node = node.getParent();
                    propPath.push(item.property);
                    item = node.item;
                }
                if(propPath.length == 0){
                    // working with an item attribute already
                    store.setValue(item.parent, item.property, val);
                }else{
                    // need to walk back down the item property to the object
                    storeItemVal = getValue(store, item.parent, item.property);
                    if(storeItemVal instanceof Array){
                    	// create a copy for modification
                    	storeItemVal = storeItemVal.concat();
                    }
                    itemVal = storeItemVal;
                    while(propPath.length > 1){
                        itemVal = itemVal[propPath.pop()];
                    }
                    itemVal[propPath] = val; // this change is reflected in storeItemVal as well
                    store.setValue(item.parent, item.property, storeItemVal);
                }              
            }else{
                // adding a property
                if(store.isItem(item.value) && !(item.value instanceof Array)){ // why && !(item.value instanceof Array) ???
                    // adding a top-level property to an item
                    store.setValue(item.value, vals.property, val);
                }else{
                    // adding a property to a lower level in an item
                    propPath.push(vals.property);
                    while(!store.isItem(item.parent)){
                        node = node.getParent();
                        propPath.push(item.property);
                        item = node.item;
                    }
                    storeItemVal = getValue(store, item.parent, item.property);
                    itemVal = storeItemVal;
                    while(propPath.length > 1){
                        itemVal = itemVal[propPath.pop()];
                    }
                    itemVal[propPath] = val;
                    store.setValue(item.parent, item.property, storeItemVal);
                }
            }
            dijit.getEnclosingWidget(dojo.query("input[name='property']", editDialog.containerNode)[0]).attr("disabled", true);
        }
    	

        if(editDialog.validate()){
            node = this.lastFocused;
            if(node.item.addNew && !(node.item.parent instanceof Array)){  // why && !(node.item.parent instanceof Array) ???
                // when the dialog closed it refocused the Add new Property node!  this is a "feature" of the dialog.
                // except we don't refocus when the parent is an array (not sure why it is refocused otherwise)
                node = node.getParent();
            }
            item = node.item;
            val = null;
            switch(vals.itemType){
                case "reference":
                    this.store.fetchItemByIdentity({identity:vals._reference,
                    	onItem:function(item){
                    		val = item;
                    		setValue();
                    	},
                    	onError:function(){
                    		alert("The id could not be found");
                    	}
                	});
                    break;
                case "value":
                	var jsonVal = vals.jsonVal;
                    val = dojo.fromJson(jsonVal);
                    // if it is a function we want to preserve the source (comments, et al)
                    if(typeof val == 'function'){
                    	val.toString = function(){
                    		return jsonVal;
                    	}
                    }
                    setValue();
                    break;
            }
        }else{
            // the form didn't validate - show it again.
            editDialog.show();
        }
    },
    _editProperty: function(){
        // this mixin stops us polluting the tree item with jsonVal etc.
        var item = dojo.mixin({}, this.lastFocused.item);
        // create the dialog or reset it if it already exists
        if(!this._editDialog){
            this._createEditDialog();
        }else{
            this._editDialog.reset();
        }
        var editingItem = dijit.getEnclosingWidget(dojo.query("input[name='property']", this._editDialog.containerNode)[0]).attr("disabled");
        if(editingItem){
            // not allowed to edit an item's id - so check for that and stop it.
            if(dojo.indexOf(this.store.getIdentityAttributes(), item.property) >= 0){
                alert("Cannot Edit an Identifier!");
            }else{
                this._editDialog.attr("title", "Edit Property");
                if(this.store.isItem(item.value)){
                    // root node || Item reference
                    if(item.parent){
                        // Item reference
                        item.itemType = "reference";
                        this._enableFields(item.itemType);
                        item._reference = this.store.getIdentity(item.value);
                        this._editDialog.attr("value", item);
                        this._editDialog.show();
                    } // else root node
                }else{
                    if(item.value && typeof item.value == 'object' && !(item.value instanceof Date)){
                        // item.value is an object but it's NOT an item from the store - no-op
                        // only allow editing on a property not on the node that represents the object/array
                    }else{
                        // this is a primitive
                        item.itemType = "value";
                        this._enableFields(item.itemType);
                        item.jsonVal = typeof item.value == 'function' ?
                        		// use the plain toString for functions, dojo.toJson doesn't support functions 
                        		item.value.toString() :
                        			item.value instanceof Date ?
                        				// A json-ish form of a date:
                        				'new Date("' + item.value + '")' : 
                        				dojo.toJson(item.value);
                        this._editDialog.attr("value", item);
                        this._editDialog.show();
                    }
                }
            }
        }else{
            // adding a property
            this._editDialog.attr("title", "Add Property");
            // default to a value type
            this._enableFields("value");
            this._editDialog.attr("value", {itemType: "value"});
            this._editDialog.show();
        }
    },
    _destroyProperty: function(){
        // using explore_ItemFileWriteStore.html if you select "Africa" in the grid and delete the
        // "type" property of "Egypt" (ie the "type" property of Africa's children[0] element)
        // this is not deleted in the tree. the store is correct but the tree is out of sync.
        var node = this.lastFocused;
        var item = node.item;
        var propPath = [];
        // we have to walk up the tree to the item before we can know if we're working with the identifier
        while(!this.store.isItem(item.parent)){
            node = node.getParent();
            propPath.push(item.property);
            item = node.item;
        }
        // this will prevent any part of the identifier from being changed
        if(dojo.indexOf(this.store.getIdentityAttributes(), item.property) >= 0){
            alert("Cannot Delete an Identifier!");
        }else{
            if(propPath.length > 0){
                // not deleting a top-level property of an item so get the top-level store item to change
                var itemVal, storeItemVal = getValue(this.store, item.parent, item.property);
                itemVal = storeItemVal;
                // walk back down the object if needed
                while(propPath.length > 1){
                    itemVal = itemVal[propPath.pop()];
                }
                // delete the property
                if(dojo.isArray(itemVal)){
                    // the value being deleted represents an array element
                    itemVal.concat();
                    itemVal.splice(propPath, 1);
                }else{
                    // object property
                    delete itemVal[propPath];
                }
                // save it back to the store
                this.store.setValue(item.parent, item.property, storeItemVal);
            }else{
                // deleting an item property
                this.store.unsetAttribute(item.parent, item.property);
            }       
        }
    },
    _addProperty: function(){
        var item = this.lastFocused.item;
        if(item.property && dojo.indexOf(this.store.getIdentityAttributes(), item.property) >= 0){
            alert("Cannot add properties to this node!");
        }else{
            if(!this._editDialog){
                this._createEditDialog();
            }
            // enable the property TextBox
            dijit.getEnclosingWidget(dojo.query("input[name='property']", this._editDialog.containerNode)[0]).attr("disabled", false);
            this._editProperty();
        }
    }
});
})();
